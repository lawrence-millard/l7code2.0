import * as Schema from "effect/Schema";

import { EnvironmentId, IsoDateTime, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

export const BoatSandboxId = TrimmedNonEmptyString.pipe(Schema.brand("BoatSandboxId"));
export type BoatSandboxId = typeof BoatSandboxId.Type;

export const BoatSandboxStatus = Schema.Literals([
  "creating",
  "starting",
  "ready",
  "running",
  "idle",
  "stopping",
  "stopped",
  "resuming",
  "failed",
  "unknown",
]);
export type BoatSandboxStatus = typeof BoatSandboxStatus.Type;

export const BoatEnvironment = Schema.Struct({
  sandboxId: BoatSandboxId,
  label: TrimmedNonEmptyString,
  status: BoatSandboxStatus,
  /** Public HTTPS URL from `boat host` (may include `_token`). */
  hostUrl: Schema.NullOr(TrimmedNonEmptyString),
  /** Derived WSS base URL for L7 clients. */
  wsBaseUrl: Schema.NullOr(TrimmedNonEmptyString),
  serverPort: Schema.Int,
  lastError: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type BoatEnvironment = typeof BoatEnvironment.Type;

export const BoatDeployInput = Schema.Struct({
  label: Schema.optionalKey(TrimmedNonEmptyString),
  /** Override the settings bootstrap command for this deploy. */
  bootstrapCommand: Schema.optionalKey(TrimmedString),
  ttlSeconds: Schema.optionalKey(Schema.Int),
});
export type BoatDeployInput = typeof BoatDeployInput.Type;

export const BoatSandboxIdInput = Schema.Struct({
  sandboxId: BoatSandboxId,
});
export type BoatSandboxIdInput = typeof BoatSandboxIdInput.Type;

export class BoatError extends Schema.TaggedError<BoatError>()("BoatError", {
  reason: Schema.Literals([
    "not_configured",
    "api",
    "deploy",
    "not_found",
    "storage",
    "invalid",
  ]),
  message: Schema.String,
  sandboxId: Schema.optionalKey(BoatSandboxId),
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** Convert an `on.boat.dev` HTTPS host URL into a WSS base for L7 RPC. */
export function boatHostUrlToWsBaseUrl(hostUrl: string): string {
  const url = new URL(hostUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  // Keep `_token` for private hosted ports; L7 clients talk over the same origin.
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.pathname = path;
  return url.toString();
}

/** Optional link from a Boat sandbox to a registered client environment id. */
export const BoatEnvironmentLink = Schema.Struct({
  sandboxId: BoatSandboxId,
  environmentId: EnvironmentId,
});
export type BoatEnvironmentLink = typeof BoatEnvironmentLink.Type;
