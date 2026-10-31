import { type AgentProjectId, type EnvironmentId, WS_METHODS } from "@l7code/contracts";
import * as Effect from "effect/Effect";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createAgentProjectEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const list = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:agent-projects:list",
    tag: WS_METHODS.agentProjectsList,
    staleTimeMs: 5_000,
  });

  const get = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:agent-projects:get",
    tag: WS_METHODS.agentProjectsGet,
    staleTimeMs: 2_000,
  });

  const refreshListAndProject = (
    registry: AtomRegistry.AtomRegistry,
    environmentId: EnvironmentId,
    projectId: AgentProjectId,
  ) =>
    Effect.sync(() => {
      registry.refresh(list({ environmentId, input: undefined }));
      registry.refresh(get({ environmentId, input: { projectId } }));
    });

  return {
    list,
    get,
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:create",
      tag: WS_METHODS.agentProjectsCreate,
      onSuccess: ({ environmentId }, registry) =>
        Effect.sync(() => registry.refresh(list({ environmentId, input: undefined }))),
    }),
    update: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:update",
      tag: WS_METHODS.agentProjectsUpdate,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
    delete: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:delete",
      tag: WS_METHODS.agentProjectsDelete,
      onSuccess: ({ environmentId }, registry) =>
        Effect.sync(() => registry.refresh(list({ environmentId, input: undefined }))),
    }),
    attachThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:attach-thread",
      tag: WS_METHODS.agentProjectsAttachThread,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
    detachThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:detach-thread",
      tag: WS_METHODS.agentProjectsDetachThread,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
    attachFolder: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:attach-folder",
      tag: WS_METHODS.agentProjectsAttachFolder,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
    detachFolder: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:detach-folder",
      tag: WS_METHODS.agentProjectsDetachFolder,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
    upsertWorkstream: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:upsert-workstream",
      tag: WS_METHODS.agentProjectsUpsertWorkstream,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
    deleteWorkstream: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent-projects:delete-workstream",
      tag: WS_METHODS.agentProjectsDeleteWorkstream,
      onSuccess: ({ environmentId, input }, registry) =>
        refreshListAndProject(registry, environmentId, input.projectId),
    }),
  };
}
