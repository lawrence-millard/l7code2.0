import { type ServerProviderAuth, type ServerProviderModel } from "@l7code/contracts";
import type { CommandCodeSettings } from "../settings.ts";
import { createModelCapabilities } from "@l7code/shared/model";
import { resolveSpawnCommand } from "@l7code/shared/shell";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/process/ChildProcess";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import {
  COMMAND_CODE_DEFAULT_MODEL_SLUG,
  COMMAND_CODE_DRIVER_KIND,
  COMMAND_CODE_EFFORT_OPTION_DESCRIPTOR,
  COMMAND_CODE_SUPPORTED_RUNTIME_MODES,
} from "./acpSupport.ts";
import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  DEFAULT_TIMEOUT_MS,
  isCommandMissingCause,
  nonEmptyTrimmed,
  parseGenericCliVersion,
  type ProviderProbeResult,
  providerModelsFromSettings,
  type ServerProviderDraft,
  spawnAndCollect,
} from "@l7code/provider-core/server/snapshotProbe";
import { resolveCommandCodeBinary } from "./binary.ts";


const COMMAND_CODE_PRESENTATION = {
  displayName: "Command Code",
  showInteractionModeToggle: false,
  supportedRuntimeModes: COMMAND_CODE_SUPPORTED_RUNTIME_MODES,
} as const;
const COMMAND_CODE_MODEL_CAPABILITIES = createModelCapabilities({
  optionDescriptors: [COMMAND_CODE_EFFORT_OPTION_DESCRIPTOR],
});

/**
 * "Default" keeps the model `command-code status` reports as its alias, which the
 * adapter selects for it. `command-code models` lists the rest.
 */
const commandCodeModels = (
  settings: CommandCodeSettings,
  defaultModel?: string,
  listed: ReadonlyArray<string> = [],
): ReadonlyArray<ServerProviderModel> =>
  providerModelsFromSettings(
    [
      {
        slug: COMMAND_CODE_DEFAULT_MODEL_SLUG,
        name: defaultModel === undefined ? "Default" : `Default (${defaultModel})`,
        ...(defaultModel === undefined ? {} : { aliases: [defaultModel] }),
        isCustom: false,
        isDefault: true,
        capabilities: COMMAND_CODE_MODEL_CAPABILITIES,
      },
      ...listed
        .filter((id, index) => id !== COMMAND_CODE_DEFAULT_MODEL_SLUG && listed.indexOf(id) === index)
        .map((id) => ({
          slug: id,
          name: id,
          isCustom: false,
          capabilities: COMMAND_CODE_MODEL_CAPABILITIES,
        })),
    ],
    settings.customModels,
    COMMAND_CODE_MODEL_CAPABILITIES,
  );

const snapshot = (
  settings: CommandCodeSettings,
  checkedAt: string,
  probe: ProviderProbeResult,
  defaultModel?: string,
  listed?: ReadonlyArray<string>,
): ServerProviderDraft => ({
  ...buildServerProvider({
    // Gives the snapshot its version advisory; command-code runs no enrichment pass.
    driver: COMMAND_CODE_DRIVER_KIND,
    presentation: COMMAND_CODE_PRESENTATION,
    enabled: settings.enabled,
    checkedAt,
    models: commandCodeModels(settings, defaultModel, listed),
    probe,
  }),
  // Every `command-code acp` session is saved under `~/.command-code` and ACP has no session
  // delete, so a throwaway text-generation session would stay on disk.
  supportsTextGeneration: false,
});

export const buildInitialCommandCodeProviderSnapshot = (
  settings: CommandCodeSettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.map(DateTime.now, (now) =>
    snapshot(settings, DateTime.formatIso(now), {
      installed: settings.enabled,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: settings.enabled
        ? "Checking Command Code CLI availability..."
        : "Command Code is disabled in L7 Code settings.",
    }),
  );

const runCommandCodeCli = Effect.fn("runCommandCodeCli")(function* (
  settings: CommandCodeSettings,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
) {
  const command = resolveCommandCodeBinary(settings.binaryPath);
  const spawnCommand = yield* resolveSpawnCommand(command, args, { env: environment });
  return yield* spawnAndCollect(
    command,
    ChildProcess.make(spawnCommand.command, spawnCommand.args, {
      env: environment,
      shell: spawnCommand.shell,
    }),
  );
});

/** `command-code status --json` on command-code 0.0.13: `auth` names the login method, `missing` when signed out. */
const CommandCodeStatus = Schema.fromJsonString(
  Schema.Struct({
    auth: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
  }),
);
const decodeCommandCodeStatus = Schema.decodeUnknownOption(CommandCodeStatus);
const CommandCodeModels = Schema.fromJsonString(
  Schema.Struct({ ids: Schema.optional(Schema.Array(Schema.String)) }),
);
const decodeCommandCodeModels = Schema.decodeUnknownOption(CommandCodeModels);

function commandCodeAuth(auth: string | undefined): ServerProviderAuth {
  const method = nonEmptyTrimmed(auth);
  if (method === undefined) return { status: "unknown" };
  return method === "missing"
    ? { status: "unauthenticated" }
    : { status: "authenticated", label: method };
}

/**
 * Reads `command-code --version`, `command-code status --json` (login and default model) and
 * `command-code models --json`. None of them opens an ACP session, which command-code would save.
 */
export const checkCommandCodeProviderStatus = Effect.fn("checkCommandCodeProviderStatus")(function* (
  settings: CommandCodeSettings,
  environment: NodeJS.ProcessEnv,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  if (!settings.enabled) {
    return snapshot(settings, checkedAt, {
      installed: false,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: "Command Code is disabled in L7 Code settings.",
    });
  }

  const versionResult = yield* runCommandCodeCli(settings, ["--version"], environment).pipe(
    Effect.timeoutOption(DEFAULT_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(versionResult) || Option.isNone(versionResult.success)) {
    const missing = Result.isFailure(versionResult) && isCommandMissingCause(versionResult.failure);
    return snapshot(settings, checkedAt, {
      installed: !missing,
      version: null,
      status: "error",
      auth: { status: "unknown" },
      message: missing ? "Command Code is not installed or not on PATH." : "Failed to run Command Code `--version`.",
    });
  }
  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    return snapshot(settings, checkedAt, {
      installed: true,
      version,
      status: "error",
      auth: { status: "unknown" },
      message: "command-code is installed but failed to run.",
    });
  }

  const read = (args: ReadonlyArray<string>) =>
    runCommandCodeCli(settings, args, environment).pipe(
      Effect.timeoutOption(AUTH_PROBE_TIMEOUT_MS),
      Effect.map(Option.filter((output) => output.code === 0)),
      Effect.map(Option.map((output) => output.stdout)),
      Effect.orElseSucceed(() => Option.none<string>()),
    );
  const status = Option.flatMap(yield* read(["status", "--json"]), decodeCommandCodeStatus);
  const listed = Option.flatMap(yield* read(["models", "--json"]), decodeCommandCodeModels).pipe(
    Option.map((models) => models.ids?.flatMap((id) => nonEmptyTrimmed(id) ?? []) ?? []),
  );
  const auth = commandCodeAuth(Option.getOrUndefined(status)?.auth);
  const defaultModel = nonEmptyTrimmed(Option.getOrUndefined(status)?.model);
  const probe =
    auth.status === "unauthenticated"
      ? { status: "error" as const, message: "Run `command-code login` to sign in." }
      : auth.status === "unknown"
        ? {
            status: "warning" as const,
            message: "command-code is installed but login state could not be determined.",
          }
        : Option.isNone(listed)
          ? {
              status: "warning" as const,
              message: "command-code is installed but model listing failed. Model options may be incomplete.",
            }
          : { status: "ready" as const };
  return snapshot(
    settings,
    checkedAt,
    { installed: true, version, auth, ...probe },
    defaultModel,
    Option.getOrUndefined(listed),
  );
});

/** command-code's id for "Default": the alias the snapshot gave it, if `command-code status` reported one. */
export const commandCodeDefaultModelId = (models: ReadonlyArray<ServerProviderModel>) =>
  models.find((model) => model.slug === COMMAND_CODE_DEFAULT_MODEL_SLUG)?.aliases?.[0];
