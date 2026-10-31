import type * as EffectAcpSchema from "effect-acp/compat";
import {
  type ModelSelection,
  type ProviderOptionDescriptor,
  ProviderDriverKind,
  type RuntimeMode,
} from "@l7code/contracts";
import type { CommandCodeSettings } from "../settings.ts";
import { resolveCommandCodeBinary } from "./binary.ts";
import { getModelSelectionStringOptionValue } from "@l7code/shared/model";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";

import * as AcpSessionRuntime from "@l7code/provider-acp/server/AcpSessionRuntime";
import { collectSessionConfigOptionValues } from "@l7code/provider-acp/server/runtimeModel";
import {
  acpPermissionDisposition,
  type AcpPermissionDisposition,
} from "@l7code/provider-acp/server/clientPolicy";
import type * as ProviderAdapter from "@l7code/provider-core/server/ProviderAdapter";

export const COMMAND_CODE_DRIVER_KIND = ProviderDriverKind.make("commandCode");
/** T3's slug for "Default": the model `command-code status` reports, never an command-code model id. */
export const COMMAND_CODE_DEFAULT_MODEL_SLUG = "default";
const COMMAND_CODE_MODEL_CONFIG_ID = "model";
const COMMAND_CODE_MODE_CONFIG_ID = "mode";
const COMMAND_CODE_EFFORT_CONFIG_ID = "effort";
const COMMAND_CODE_DEFAULT_EFFORT = "medium";

const COMMAND_CODE_EFFORT_LABELS = {
  auto: "Auto",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
} as const;

export const COMMAND_CODE_EFFORT_OPTION_DESCRIPTOR: ProviderOptionDescriptor = {
  id: COMMAND_CODE_EFFORT_CONFIG_ID,
  label: "Effort",
  type: "select",
  options: Object.entries(COMMAND_CODE_EFFORT_LABELS).map(([id, label]) => ({
    id,
    label,
    ...(id === COMMAND_CODE_DEFAULT_EFFORT ? { isDefault: true } : {}),
  })),
};

export const COMMAND_CODE_SUPPORTED_RUNTIME_MODES = [
  "approval-required",
  "auto",
] as const satisfies ReadonlyArray<RuntimeMode>;
/** command-code 0.0.13 answers a cancelled prompt with `stopReason: cancelled`. */
export const COMMAND_CODE_ACP_CANCEL_BEHAVIOR = "wait-for-prompt" as const;

/**
 * Supervised runs command-code's `ask` mode and Auto its automatic review. An explicit
 * approval or sandbox policy must not launch automatic review, which would
 * perform writes the policy meant to confine.
 */
export function commandCodeSessionModeForPolicy(
  policy: ProviderAdapter.ProviderAdapterV2RuntimePolicy,
): "ask" | "auto" {
  return policy.runtimeMode === "auto" &&
    policy.approvalPolicy === undefined &&
    policy.sandboxPolicy === undefined
    ? "auto"
    : "ask";
}

/** In automatic review command-code asks only about what it refused itself, so every prompt reaches the user. */
export function commandCodePermissionDisposition(
  policy: ProviderAdapter.ProviderAdapterV2RuntimePolicy,
  request: EffectAcpSchema.RequestPermissionRequest,
): AcpPermissionDisposition {
  return commandCodeSessionModeForPolicy(policy) === "auto"
    ? "ask"
    : acpPermissionDisposition({ ...policy, runtimeMode: "approval-required" }, request);
}

/**
 * command-code's id for a requested mode, first advertised match wins. command-code 0.0.13 calls
 * automatic review `code`; command-code after vercel-labs/command-code#1189 calls it `auto`.
 * `code` is also accepted as a request because the shared plan restore
 * passes a session's saved mode id back.
 */
function commandCodeModeId(requested: string, advertised: ReadonlyArray<string>): string | undefined {
  const candidates =
    requested === "ask"
      ? ["ask"]
      : requested === "auto" || requested === "code"
        ? ["auto", "code"]
        : [];
  return candidates.find((id) => advertised.includes(id));
}

/**
 * command-code 0.0.13 reports `ask` on a new or loaded session but enforces its saved
 * default until a client writes the mode, and the runtime skips writes that
 * match the reported mode. So the first write after start or load always goes
 * out. A mode command-code does not advertise fails before anything is sent.
 */
export function withCommandCodeSessionMode(
  runtime: AcpSessionRuntime.AcpSessionRuntime["Service"],
): AcpSessionRuntime.AcpSessionRuntime["Service"] {
  let pendingSessionId: string | undefined;
  const activated = <E, R>(
    effect: Effect.Effect<AcpSessionRuntime.AcpSessionRuntimeStartResult, E, R>,
  ) =>
    effect.pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          pendingSessionId = result.sessionId;
        }),
      ),
    );
  return {
    ...runtime,
    start: () => activated(runtime.start()),
    loadSession: (sessionId, options) => activated(runtime.loadSession(sessionId, options)),
    resumeSession: (sessionId, options) => activated(runtime.resumeSession(sessionId, options)),
    forkSession: (sessionId, options) => activated(runtime.forkSession(sessionId, options)),
    setMode: Effect.fn("setCommandCodeMode")(function* (requested) {
      const state = yield* runtime.getModeState;
      const advertised = state?.availableModes.map((mode) => mode.id) ?? [];
      const target = commandCodeModeId(requested, advertised);
      if (target === undefined) {
        return yield* new EffectAcpErrors.AcpRequestError({
          code: -32602,
          errorMessage: `command-code cannot run in mode "${requested}"; it advertises ${advertised.join(", ") || "no modes"}.`,
          data: {
            configId: COMMAND_CODE_MODE_CONFIG_ID,
            allowedValues: advertised,
            receivedValue: requested,
          },
        });
      }
      const sessionId = pendingSessionId;
      if (sessionId === undefined || state?.currentModeId !== target) {
        const response = yield* runtime.setMode(target);
        pendingSessionId = undefined;
        return response;
      }
      yield* runtime.request("session/set_config_option", {
        sessionId,
        configId: COMMAND_CODE_MODE_CONFIG_ID,
        value: target,
      });
      // Only a write command-code took counts, so a retried setup sends it again.
      pendingSessionId = undefined;
      return {};
    }),
  };
}

/**
 * Writes config id `model` (command-code's `provider` option shares its category).
 * "Default" picks the model `command-code status` reports when the session lists it.
 * An unlisted model the thread picked is still sent: command-code's backends accept or
 * refuse it themselves, so a thread never runs on a model it did not pick.
 */
export const applyCommandCodeModelSelection = Effect.fn("applyCommandCodeModelSelection")(function* (
  runtime: AcpSessionRuntime.AcpSessionRuntime["Service"],
  modelSelection: ModelSelection,
  defaultModel: Effect.Effect<string | undefined> | undefined,
): Effect.fn.Return<string | undefined, EffectAcpErrors.AcpError> {
  const option = (yield* runtime.getConfigOptions).find(
    (entry) => entry.id === COMMAND_CODE_MODEL_CONFIG_ID && entry.type === "select",
  );
  const current = option?.type === "select" ? option.currentValue : undefined;
  const requested = modelSelection.model.trim();
  const isDefault = requested.length === 0 || requested === COMMAND_CODE_DEFAULT_MODEL_SLUG;
  const target = isDefault ? defaultModel && (yield* defaultModel) : requested;
  if (target === undefined || target === current) return current;
  // The status default can belong to another command-code backend than the session's
  // (after `command-code provider`, or a loaded older session); then the session's
  // own model stands.
  if (
    isDefault &&
    (option === undefined || !collectSessionConfigOptionValues(option).includes(target))
  ) {
    return current;
  }
  yield* runtime.setConfigOption(COMMAND_CODE_MODEL_CONFIG_ID, target, { allowUnlistedValue: true });
  return target;
});

/** The shared option loop writes a stored effort; a thread without one starts at medium. */
export const applyCommandCodeEffortDefault = Effect.fn("applyCommandCodeEffortDefault")(function* (
  runtime: AcpSessionRuntime.AcpSessionRuntime["Service"],
  modelSelection: ModelSelection,
): Effect.fn.Return<void, EffectAcpErrors.AcpError> {
  if (getModelSelectionStringOptionValue(modelSelection, COMMAND_CODE_EFFORT_CONFIG_ID)) return;
  const option = (yield* runtime.getConfigOptions).find(
    (entry) => entry.id === COMMAND_CODE_EFFORT_CONFIG_ID && entry.type === "select",
  );
  if (
    option !== undefined &&
    collectSessionConfigOptionValues(option).includes(COMMAND_CODE_DEFAULT_EFFORT)
  ) {
    yield* runtime.setConfigOption(COMMAND_CODE_EFFORT_CONFIG_ID, COMMAND_CODE_DEFAULT_EFFORT);
  }
});

interface CommandCodeAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "spawn" | "cancelBehavior"
> {
  readonly commandCodeSettings: Pick<CommandCodeSettings, "binaryPath">;
  readonly environment?: NodeJS.ProcessEnv;
}

export const makeCommandCodeAcpRuntime = Effect.fn("makeCommandCodeAcpRuntime")(function* (
  input: CommandCodeAcpRuntimeInput,
): Effect.fn.Return<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto | Scope.Scope
> {
  const { commandCodeSettings, environment, ...runtimeOptions } = input;
  const context = yield* Layer.build(
    AcpSessionRuntime.layer({
      ...runtimeOptions,
      spawn: {
        command: resolveCommandCodeBinary(commandCodeSettings.binaryPath),
        args: ["acp"],
        cwd: input.cwd,
        env: { ...environment },
      },
      cancelBehavior: COMMAND_CODE_ACP_CANCEL_BEHAVIOR,
    }),
  );
  return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(Effect.provide(context));
});
