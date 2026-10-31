import { WS_METHODS } from "@l7code/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createBoatEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const list = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:boat:list",
    tag: WS_METHODS.boatList,
    staleTimeMs: 5_000,
  });

  const refreshList = (
    registry: { refresh: (atom: Atom.Atom<unknown>) => void },
    environmentId: Parameters<typeof list>[0]["environmentId"],
  ) => Effect.sync(() => registry.refresh(list({ environmentId, input: undefined })));

  return {
    list,
    deploy: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:boat:deploy",
      tag: WS_METHODS.boatDeploy,
      onSuccess: ({ environmentId }, registry) => refreshList(registry, environmentId),
    }),
    refresh: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:boat:refresh",
      tag: WS_METHODS.boatRefresh,
      onSuccess: ({ environmentId }, registry) => refreshList(registry, environmentId),
    }),
    stop: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:boat:stop",
      tag: WS_METHODS.boatStop,
      onSuccess: ({ environmentId }, registry) => refreshList(registry, environmentId),
    }),
    resume: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:boat:resume",
      tag: WS_METHODS.boatResume,
      onSuccess: ({ environmentId }, registry) => refreshList(registry, environmentId),
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:boat:remove",
      tag: WS_METHODS.boatRemove,
      onSuccess: ({ environmentId }, registry) => refreshList(registry, environmentId),
    }),
  };
}
