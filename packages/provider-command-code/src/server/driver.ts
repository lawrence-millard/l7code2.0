import { TextGenerationError } from "@l7code/contracts";
import { CommandCodeSettings } from "../settings.ts";
import * as HostProcess from "@l7code/shared/HostProcess";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import type * as ProviderHost from "@l7code/provider-core/server/ProviderHost";
import { type CommandCodeAdapterV2DriverEnv, makeCommandCodeAdapterV2Driver } from "./adapter.ts";
import { ProviderDriverError } from "@l7code/provider-core/server/errors";
import {
  buildInitialCommandCodeProviderSnapshot,
  checkCommandCodeProviderStatus,
  commandCodeDefaultModelId,
} from "./status.ts";
import { makeManagedServerProvider } from "@l7code/provider-core/server/managedProvider";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@l7code/provider-core/server/driver";
import { withInstanceIdentity } from "@l7code/provider-core/server/instanceIdentity";
import { mergeProviderInstanceEnvironment } from "@l7code/provider-core/server/instanceEnvironment";
import { discoverCommandCodeSkills } from "./skills.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "@l7code/provider-core/server/maintenanceResolver";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@l7code/provider-core/server/snapshotSettings";
import type { ProviderTextGeneration } from "@l7code/provider-core/server/textGeneration";
import { COMMAND_CODE_DRIVER_KIND } from "./acpSupport.ts";

const decodeFxSettings = Schema.decodeSync(CommandCodeSettings);
// command-code installs from its own setup script and updates with `command-code upgrade`; there
// is no npm package to read a latest version from.
const MAINTENANCE = makeManualOnlyProviderMaintenanceCapabilities({
  provider: COMMAND_CODE_DRIVER_KIND,
  packageName: null,
});

// See `supportsTextGeneration` in status.ts.
const unsupportedTextGeneration: ProviderTextGeneration = (() => {
  const unsupported = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: "command-code does not provide application text generation.",
      }),
    );
  return {
    generateCommitMessage: () => unsupported("generateCommitMessage"),
    generatePrContent: () => unsupported("generatePrContent"),
    generateBranchName: () => unsupported("generateBranchName"),
    generateThreadTitle: () => unsupported("generateThreadTitle"),
    generateReviewGuide: () => unsupported("generateReviewGuide"),
  };
})();

export type CommandCodeDriverEnv =
  | CommandCodeAdapterV2DriverEnv
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ProviderHost.ProviderHost;

export const CommandCodeDriver: ProviderDriver<CommandCodeSettings, CommandCodeDriverEnv> = {
  driverKind: COMMAND_CODE_DRIVER_KIND,
  metadata: {
    displayName: "Command Code",
    supportsMultipleInstances: true,
  },
  configSchema: CommandCodeSettings,
  defaultConfig: (): CommandCodeSettings => decodeFxSettings({}),
  create: Effect.fn("CommandCodeDriver.create")(function* ({
    instanceId,
    displayName,
    accentColor,
    environment,
    enabled,
    config,
  }) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processEnv = yield* mergeProviderInstanceEnvironment(
      environment,
      yield* HostProcess.Environment,
    );
    const continuationIdentity = defaultProviderContinuationIdentity({
      driverKind: COMMAND_CODE_DRIVER_KIND,
      instanceId,
    });
    const stampIdentity = withInstanceIdentity({
      instanceId,
      driverKind: COMMAND_CODE_DRIVER_KIND,
      displayName,
      accentColor,
      continuationGroupKey: continuationIdentity.continuationKey,
    });
    const effectiveConfig = { ...config, enabled } satisfies CommandCodeSettings;
    const snapshotSettings = yield* makeProviderSnapshotSettingsSource(effectiveConfig);
    const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<CommandCodeSettings>>({
      resolveMaintenance: () => Effect.succeed(MAINTENANCE),
      getSettings: snapshotSettings.getSettings,
      streamSettings: snapshotSettings.streamSettings,
      haveSettingsChanged: haveProviderSnapshotSettingsChanged,
      initialSnapshot: (settings) =>
        buildInitialCommandCodeProviderSnapshot(settings.provider).pipe(Effect.map(stampIdentity)),
      checkProvider: checkCommandCodeProviderStatus(effectiveConfig, processEnv).pipe(
        Effect.map(stampIdentity),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      ),
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: COMMAND_CODE_DRIVER_KIND,
            instanceId,
            detail: "Failed to build the command-code provider snapshot.",
            cause,
          }),
      ),
    );

    // "Default" selects the model the snapshot read from `command-code status`.
    const orchestrationAdapter = yield* makeCommandCodeAdapterV2Driver(
      snapshot.getSnapshot.pipe(Effect.map((current) => commandCodeDefaultModelId(current.models))),
    )
      .create({ instanceId, displayName, accentColor, environment, enabled, config })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: COMMAND_CODE_DRIVER_KIND,
              instanceId,
              detail: "Failed to build the command-code orchestration adapter.",
              cause,
            }),
        ),
      );

    return {
      instanceId,
      driverKind: COMMAND_CODE_DRIVER_KIND,
      continuationIdentity,
      displayName,
      accentColor,
      enabled,
      snapshot,
      snapshotForCwd: (cwd) =>
        !effectiveConfig.enabled
          ? snapshot.getSnapshot
          : Effect.all([
              snapshot.getSnapshot,
              discoverCommandCodeSkills({ cwd, environment: processEnv }).pipe(
                Effect.provideService(FileSystem.FileSystem, fileSystem),
                Effect.provideService(Path.Path, path),
              ),
            ]).pipe(Effect.map(([machineSnapshot, skills]) => ({ ...machineSnapshot, skills }))),
      orchestrationAdapter,
      textGeneration: unsupportedTextGeneration,
    } satisfies ProviderInstance;
  }),
};
