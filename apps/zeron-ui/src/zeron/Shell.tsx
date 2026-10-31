import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@l7code/client-runtime/environment";
import type { ModelSelection, ThreadId } from "@l7code/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  filterSpaces,
  parseSpaceId,
  projectToSpace,
  sortSessionsByAttention,
  startSessionTurn,
  threadShellToSession,
  type SpaceId,
} from "../adapter";
import { useProjects, useQuietThreadShells } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { primaryServerProvidersAtom } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { buildThreadRouteParams } from "../threadRoutes";
import { Composer } from "./Composer";
import { NewSessionCanvas } from "./NewSessionCanvas";
import { SessionList } from "./SessionList";
import { SpacesRail } from "./SpacesRail";
import { Transcript } from "./Transcript";

function pickDefaultModel(
  providers: ReadonlyArray<{
    readonly enabled: boolean;
    readonly instanceId: ModelSelection["instanceId"];
    readonly name?: string | null;
    readonly models?: ReadonlyArray<{
      readonly slug: string;
      readonly name?: string | null;
    }> | null;
  }>,
): { selection: ModelSelection; label: string } | null {
  const enabled = providers.filter((provider) => provider.enabled);
  const preferred =
    enabled.find((provider) => provider.instanceId === "devReplay") ??
    enabled.find((provider) => (provider.models?.length ?? 0) > 0) ??
    enabled[0];
  const model = preferred?.models?.[0];
  if (!preferred || model === undefined) return null;
  const label = `${preferred.name ?? preferred.instanceId} · ${model.name ?? model.slug}`;
  return { selection: { instanceId: preferred.instanceId, model: model.slug }, label };
}

export function ZeronShell() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    environmentId?: string;
    threadId?: string;
  };
  const projects = useProjects();
  const threads = useQuietThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });

  const [spaceQuery, setSpaceQuery] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<SpaceId | null>(null);

  const envLabel = (environmentId: string) =>
    environments.find((env) => env.environmentId === environmentId)?.label ?? "Local";

  const spaces = useMemo(() => {
    const mapped = projects.map((project) =>
      projectToSpace(project, envLabel(project.environmentId)),
    );
    return filterSpaces(mapped, spaceQuery);
  }, [projects, environments, spaceQuery]);

  const activeSpaceId = useMemo(() => {
    if (selectedSpaceId && spaces.some((space) => space.spaceId === selectedSpaceId)) {
      return selectedSpaceId;
    }
    if (params.environmentId && params.threadId) {
      const thread = threads.find(
        (candidate) =>
          candidate.environmentId === params.environmentId && candidate.id === params.threadId,
      );
      if (thread) return `${thread.environmentId}:${thread.projectId}` as SpaceId;
    }
    const primaryProject = projects.find(
      (project) => project.environmentId === primaryEnvironmentId,
    );
    return primaryProject
      ? (`${primaryProject.environmentId}:${primaryProject.id}` as SpaceId)
      : (spaces[0]?.spaceId ?? null);
  }, [selectedSpaceId, spaces, params, threads, projects, primaryEnvironmentId]);

  const sessions = useMemo(() => {
    if (activeSpaceId === null) return [];
    const parsed = parseSpaceId(activeSpaceId);
    if (parsed === null) return [];
    return sortSessionsByAttention(
      threads
        .filter(
          (thread) =>
            thread.environmentId === parsed.environmentId &&
            thread.projectId === parsed.projectId &&
            thread.archivedAt === null &&
            thread.deletedAt === null,
        )
        .map(threadShellToSession),
    );
  }, [threads, activeSpaceId]);

  const activeThread =
    params.environmentId && params.threadId
      ? threads.find(
          (thread) =>
            thread.environmentId === params.environmentId && thread.id === params.threadId,
        )
      : null;

  const model = pickDefaultModel(providers);
  const activeProject =
    activeSpaceId === null
      ? null
      : (projects.find((project) => `${project.environmentId}:${project.id}` === activeSpaceId) ??
        null);
  const selectedSpace = spaces.find((space) => space.spaceId === activeSpaceId) ?? null;

  const send = async (text: string, threadId?: ThreadId) => {
    if (activeSpaceId === null || activeProject === null || model === null) {
      throw new Error("Pick a space with a provider model available.");
    }
    const result = await startSessionTurn({
      spaceId: activeSpaceId,
      text,
      threadId,
      project: activeProject,
      modelSelection: model.selection,
      startTurn,
    });
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(activeProject.environmentId, result.threadId)),
    });
  };

  return (
    <div className="z-app">
      <aside className="z-sidebar">
        <div className="z-brand">
          <div className="z-brand-mark-glyph">L7</div>
          <div className="z-brand-copy">
            <div className="z-brand-name">L7 Code</div>
            <div className="z-brand-mark">Zeron</div>
          </div>
        </div>
        <button
          type="button"
          className="z-new-btn"
          onClick={() => {
            void navigate({ to: "/new" });
          }}
        >
          New session
        </button>
        <SpacesRail
          spaces={spaces}
          selectedSpaceId={activeSpaceId}
          query={spaceQuery}
          onQueryChange={setSpaceQuery}
          onSelect={(spaceId) => {
            setSelectedSpaceId(spaceId);
            void navigate({ to: "/new" });
          }}
        />
        <SessionList
          sessions={sessions}
          activeThreadId={activeThread?.id ?? null}
          onSelect={(session) => {
            setSelectedSpaceId(session.spaceId);
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(
                scopeThreadRef(session.environmentId, session.threadId),
              ),
            });
          }}
        />
        <div className="z-status">Local · L7 orchestration</div>
      </aside>
      <main className="z-main">
        <div className="z-glass z-main-panel">
          {activeThread ? (
            <>
              <div className="z-header">
                <span className="z-header-title">{activeThread.title}</span>
              </div>
              <Transcript environmentId={activeThread.environmentId} threadId={activeThread.id} />
              <Composer
                layout="thread"
                disabled={model === null}
                modelLabel={model?.label}
                onSend={(text) => send(text, activeThread.id)}
              />
            </>
          ) : (
            <NewSessionCanvas
              spaces={spaces}
              selectedSpaceId={activeSpaceId}
              selectedSpace={selectedSpace}
              modelLabel={model?.label}
              onSelectSpace={setSelectedSpaceId}
              disabled={model === null || activeProject === null}
              onSend={(text) => send(text)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
