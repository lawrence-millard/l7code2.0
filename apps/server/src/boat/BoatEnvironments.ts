import {
  type BoatDeployInput,
  type BoatEnvironment,
  BoatError,
  type BoatSandboxId,
  type BoatSandboxStatus,
  boatHostUrlToWsBaseUrl,
  DEFAULT_BOAT_API_BASE,
  DEFAULT_BOAT_BOOTSTRAP_COMMAND,
  DEFAULT_BOAT_SERVER_PORT,
} from "@l7code/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import * as ServerSettings from "../serverSettings.ts";

interface BoatRow {
  readonly sandbox_id: string;
  readonly label: string;
  readonly status: string;
  readonly host_url: string | null;
  readonly ws_base_url: string | null;
  readonly server_port: number;
  readonly last_error: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const SandboxCreateResponse = Schema.Struct({
  sandbox: Schema.Struct({
    id: Schema.String,
    state: Schema.optionalKey(Schema.String),
  }),
});

const SandboxGetResponse = Schema.Struct({
  sandbox: Schema.Struct({
    id: Schema.String,
    state: Schema.optionalKey(Schema.String),
  }),
});

const HostResponse = Schema.Struct({
  url: Schema.String,
  port: Schema.optionalKey(Schema.Int),
});

const mapDecodeError = (cause: unknown) =>
  new BoatError({
    reason: "api",
    message: "Boat API response did not match the expected shape.",
    cause,
  });

const decodeCreate = (value: unknown) =>
  Schema.decodeUnknownEffect(SandboxCreateResponse)(value).pipe(Effect.mapError(mapDecodeError));
const decodeGet = (value: unknown) =>
  Schema.decodeUnknownEffect(SandboxGetResponse)(value).pipe(Effect.mapError(mapDecodeError));
const decodeHost = (value: unknown) =>
  Schema.decodeUnknownEffect(HostResponse)(value).pipe(Effect.mapError(mapDecodeError));

const failStorage = (cause: unknown) =>
  Effect.logWarning("Boat sandbox storage failed", cause).pipe(
    Effect.andThen(
      Effect.fail(
        new BoatError({
          reason: "storage",
          message: "Could not read or write Boat sandbox records.",
          cause,
        }),
      ),
    ),
  );

const normalizeStatus = (state: string | undefined): BoatSandboxStatus => {
  switch ((state ?? "").toLowerCase()) {
    case "creating":
      return "creating";
    case "starting":
      return "starting";
    case "ready":
      return "ready";
    case "running":
      return "running";
    case "idle":
      return "idle";
    case "stopping":
      return "stopping";
    case "stopped":
      return "stopped";
    case "resuming":
      return "resuming";
    case "failed":
    case "error":
      return "failed";
    default:
      return "unknown";
  }
};

const toEnvironment = (row: BoatRow): BoatEnvironment => ({
  sandboxId: row.sandbox_id as BoatSandboxId,
  label: row.label,
  status: normalizeStatus(row.status),
  hostUrl: row.host_url,
  wsBaseUrl: row.ws_base_url,
  serverPort: row.server_port,
  lastError: row.last_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class BoatEnvironments extends Context.Service<
  BoatEnvironments,
  {
    readonly list: Effect.Effect<ReadonlyArray<BoatEnvironment>, BoatError>;
    readonly deploy: (input: BoatDeployInput) => Effect.Effect<BoatEnvironment, BoatError>;
    readonly refresh: (sandboxId: BoatSandboxId) => Effect.Effect<BoatEnvironment, BoatError>;
    readonly stop: (sandboxId: BoatSandboxId) => Effect.Effect<BoatEnvironment, BoatError>;
    readonly resume: (sandboxId: BoatSandboxId) => Effect.Effect<BoatEnvironment, BoatError>;
    readonly remove: (
      sandboxId: BoatSandboxId,
    ) => Effect.Effect<{ readonly removed: boolean }, BoatError>;
  }
>()("l7/boat/BoatEnvironments") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const settings = yield* ServerSettings.ServerSettingsService;
  const httpClient = yield* HttpClient.HttpClient;

  const readConfig = Effect.fn("BoatEnvironments.readConfig")(function* () {
    const current = yield* settings.getSettings.pipe(
      Effect.mapError(
        (cause) =>
          new BoatError({
            reason: "storage",
            message: "Could not read Boat settings.",
            cause,
          }),
      ),
    );
    const apiKey = current.boat.apiKey.trim();
    if (apiKey.length === 0) {
      return yield* new BoatError({
        reason: "not_configured",
        message: "Add a Boat API key in Settings → Boat before deploying.",
      });
    }
    return {
      apiKey,
      apiBase: (current.boat.apiBase.trim() || DEFAULT_BOAT_API_BASE).replace(/\/$/, ""),
      bootstrapCommand: current.boat.bootstrapCommand.trim() || DEFAULT_BOAT_BOOTSTRAP_COMMAND,
      serverPort: current.boat.serverPort || DEFAULT_BOAT_SERVER_PORT,
    };
  });

  const requestJson = Effect.fn("BoatEnvironments.requestJson")(function* <A>(input: {
    readonly method: "GET" | "POST" | "DELETE";
    readonly path: string;
    readonly body?: unknown;
    readonly decode: (value: unknown) => Effect.Effect<A, BoatError>;
  }) {
    const config = yield* readConfig();
    const url = `${config.apiBase}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
    let request = HttpClientRequest.make(input.method)(url).pipe(
      HttpClientRequest.bearerToken(config.apiKey),
      HttpClientRequest.setHeader("Accept", "application/json"),
    );
    if (input.body !== undefined) {
      request = request.pipe(HttpClientRequest.bodyJsonUnsafe(input.body));
    }
    const response = yield* httpClient.execute(request).pipe(
      Effect.mapError(
        (cause) =>
          new BoatError({
            reason: "api",
            message: "Boat API request failed.",
            cause,
          }),
      ),
    );
    if (response.status < 200 || response.status >= 300) {
      const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
      return yield* new BoatError({
        reason: "api",
        message: `Boat API ${input.method} ${input.path} failed (${response.status}): ${text.slice(0, 240)}`,
      });
    }
    const json = yield* response.json.pipe(
      Effect.mapError(
        (cause) =>
          new BoatError({
            reason: "api",
            message: "Boat API returned invalid JSON.",
            cause,
          }),
      ),
    );
    return yield* input.decode(json);
  });

  const readRow = Effect.fn("BoatEnvironments.readRow")(function* (sandboxId: BoatSandboxId) {
    return yield* sql<BoatRow>`
      SELECT * FROM boat_sandboxes WHERE sandbox_id = ${sandboxId}
    `.pipe(
      Effect.map((rows) => Option.fromNullishOr(rows[0])),
      Effect.catch(failStorage),
    );
  });

  const upsertRow = Effect.fn("BoatEnvironments.upsertRow")(function* (env: BoatEnvironment) {
    yield* sql`
      INSERT INTO boat_sandboxes (
        sandbox_id, label, status, host_url, ws_base_url, server_port, last_error, created_at, updated_at
      ) VALUES (
        ${env.sandboxId}, ${env.label}, ${env.status}, ${env.hostUrl}, ${env.wsBaseUrl},
        ${env.serverPort}, ${env.lastError}, ${env.createdAt}, ${env.updatedAt}
      )
      ON CONFLICT (sandbox_id) DO UPDATE SET
        label = excluded.label,
        status = excluded.status,
        host_url = excluded.host_url,
        ws_base_url = excluded.ws_base_url,
        server_port = excluded.server_port,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `.pipe(Effect.catch(failStorage));
  });

  const list = Effect.fn("BoatEnvironments.list")(function* () {
    const rows = yield* sql<BoatRow>`
      SELECT * FROM boat_sandboxes ORDER BY updated_at DESC, label COLLATE NOCASE, sandbox_id
    `.pipe(Effect.catch(failStorage));
    return rows.map(toEnvironment);
  });

  const waitUntilReady = Effect.fn("BoatEnvironments.waitUntilReady")(function* (
    sandboxId: BoatSandboxId,
  ) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const remote = yield* requestJson({
        method: "GET",
        path: `/sandboxes/${sandboxId}`,
        decode: decodeGet,
      });
      const status = normalizeStatus(remote.sandbox.state);
      if (status === "ready" || status === "running" || status === "idle") return status;
      if (status === "failed") {
        return yield* new BoatError({
          reason: "deploy",
          message: `Boat sandbox ${sandboxId} failed to start.`,
          sandboxId,
        });
      }
      yield* Effect.sleep(Duration.seconds(2));
    }
    return yield* new BoatError({
      reason: "deploy",
      message: `Timed out waiting for Boat sandbox ${sandboxId} to become ready.`,
      sandboxId,
    });
  });

  const deploy = Effect.fn("BoatEnvironments.deploy")(function* (input: BoatDeployInput) {
    const config = yield* readConfig();
    const created = yield* requestJson({
      method: "POST",
      path: "/sandboxes",
      body: { ttlSeconds: input.ttlSeconds ?? 3600 },
      decode: decodeCreate,
    });
    const sandboxId = created.sandbox.id as BoatSandboxId;
    const now = DateTime.formatIso(yield* DateTime.now);
    const label = input.label?.trim() || `Boat ${sandboxId.slice(-6)}`;
    let env: BoatEnvironment = {
      sandboxId,
      label,
      status: normalizeStatus(created.sandbox.state) || "creating",
      hostUrl: null,
      wsBaseUrl: null,
      serverPort: config.serverPort,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    yield* upsertRow(env);

    yield* waitUntilReady(sandboxId);

    const bootstrap = (input.bootstrapCommand?.trim() || config.bootstrapCommand).trim();
    yield* requestJson({
      method: "POST",
      path: `/sandboxes/${sandboxId}/commands`,
      body: {
        command: bootstrap,
        detached: true,
      },
      decode: (value) => Effect.succeed(value),
    });

    // Give the server a moment to bind before hosting.
    yield* Effect.sleep(Duration.seconds(5));

    const hosted = yield* requestJson({
      method: "POST",
      path: `/sandboxes/${sandboxId}/host`,
      body: {
        port: config.serverPort,
        localhost: true,
        title: label,
      },
      decode: decodeHost,
    });

    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    env = {
      ...env,
      status: "running",
      hostUrl: hosted.url,
      wsBaseUrl: boatHostUrlToWsBaseUrl(hosted.url),
      updatedAt,
      lastError: null,
    };
    yield* upsertRow(env);
    return env;
  });

  const refresh = Effect.fn("BoatEnvironments.refresh")(function* (sandboxId: BoatSandboxId) {
    const existing = yield* readRow(sandboxId);
    if (Option.isNone(existing)) {
      return yield* new BoatError({
        reason: "not_found",
        message: `Boat sandbox ${sandboxId} is not tracked here.`,
        sandboxId,
      });
    }
    const remote = yield* requestJson({
      method: "GET",
      path: `/sandboxes/${sandboxId}`,
      decode: decodeGet,
    });
    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    const env = toEnvironment({
      ...existing.value,
      status: normalizeStatus(remote.sandbox.state),
      updated_at: updatedAt,
    });
    yield* upsertRow(env);
    return env;
  });

  const stop = Effect.fn("BoatEnvironments.stop")(function* (sandboxId: BoatSandboxId) {
    const existing = yield* readRow(sandboxId);
    if (Option.isNone(existing)) {
      return yield* new BoatError({
        reason: "not_found",
        message: `Boat sandbox ${sandboxId} is not tracked here.`,
        sandboxId,
      });
    }
    yield* requestJson({
      method: "POST",
      path: `/sandboxes/${sandboxId}/stop`,
      body: {},
      decode: (value) => Effect.succeed(value),
    });
    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    const env = toEnvironment({
      ...existing.value,
      status: "stopped",
      updated_at: updatedAt,
      last_error: null,
    });
    yield* upsertRow(env);
    return env;
  });

  const resume = Effect.fn("BoatEnvironments.resume")(function* (sandboxId: BoatSandboxId) {
    const existing = yield* readRow(sandboxId);
    if (Option.isNone(existing)) {
      return yield* new BoatError({
        reason: "not_found",
        message: `Boat sandbox ${sandboxId} is not tracked here.`,
        sandboxId,
      });
    }
    yield* requestJson({
      method: "POST",
      path: `/sandboxes/${sandboxId}/resume`,
      body: {},
      decode: (value) => Effect.succeed(value),
    });
    yield* waitUntilReady(sandboxId);
    const config = yield* readConfig();
    // Re-run bootstrap so l7 serve is up again after resume (URL stays stable).
    yield* requestJson({
      method: "POST",
      path: `/sandboxes/${sandboxId}/commands`,
      body: { command: config.bootstrapCommand, detached: true },
      decode: (value) => Effect.succeed(value),
    });
    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    let env = toEnvironment({
      ...existing.value,
      status: "running",
      updated_at: updatedAt,
      last_error: null,
    });
    if (env.hostUrl === null) {
      const hosted = yield* requestJson({
        method: "POST",
        path: `/sandboxes/${sandboxId}/host`,
        body: { port: env.serverPort, localhost: true, title: env.label },
        decode: decodeHost,
      });
      env = {
        ...env,
        hostUrl: hosted.url,
        wsBaseUrl: boatHostUrlToWsBaseUrl(hosted.url),
      };
    }
    yield* upsertRow(env);
    return env;
  });

  const remove = Effect.fn("BoatEnvironments.remove")(function* (sandboxId: BoatSandboxId) {
    const existing = yield* readRow(sandboxId);
    if (Option.isNone(existing)) return { removed: false };
    yield* requestJson({
      method: "DELETE",
      path: `/sandboxes/${sandboxId}`,
      decode: (value) => Effect.succeed(value),
    }).pipe(Effect.ignore);
    yield* sql`DELETE FROM boat_sandboxes WHERE sandbox_id = ${sandboxId}`.pipe(
      Effect.catch(failStorage),
    );
    return { removed: true };
  });

  return BoatEnvironments.of({
    list: list(),
    deploy,
    refresh,
    stop,
    resume,
    remove,
  });
});

export const layer = Layer.effect(BoatEnvironments, make).pipe(
  Layer.provide(FetchHttpClient.layer),
);
