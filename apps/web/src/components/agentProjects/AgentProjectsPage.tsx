import type {
  AgentProject,
  AgentProjectId,
  AgentProjectSummary,
  AgentProjectWorkstreamStatus,
  EnvironmentId,
} from "@l7code/contracts";
import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@l7code/contracts";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { FolderKanbanIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { agentProjectEnvironment } from "../../state/agentProjects";
import { useEnvironmentsWithScope } from "../../state/session";
import { useEnvironments } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";

const STATUS_LABEL: Record<AgentProjectWorkstreamStatus, string> = {
  todo: "To do",
  active: "Active",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_ORDER: AgentProjectWorkstreamStatus[] = ["active", "blocked", "todo", "done"];

function useReadableEnvironmentId(): EnvironmentId | null {
  const primary = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const connected = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  const readable = useEnvironmentsWithScope(connected, AuthOrchestrationReadScope);
  if (primary !== null && readable.has(primary)) return primary;
  return connected.find((environment) => readable.has(environment.environmentId))?.environmentId ?? null;
}

function CreateProjectForm({
  environmentId,
  canWrite,
}: {
  environmentId: EnvironmentId;
  canWrite: boolean;
}) {
  const [name, setName] = useState("");
  const create = useAtomCommand(agentProjectEnvironment.create, { reportFailure: true });
  if (!canWrite) return null;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length === 0) return;
        void create({ environmentId, input: { name: trimmed } }).then((result) => {
          if (result._tag === "Success") setName("");
        });
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          New project
        </span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Shared context for agents"
          maxLength={120}
        />
      </label>
      <Button type="submit" disabled={name.trim().length === 0}>
        <PlusIcon />
        Create
      </Button>
    </form>
  );
}

function ProjectListCard({
  project,
  selected,
}: {
  project: AgentProjectSummary;
  selected: boolean;
}) {
  const active =
    project.workstreamCounts.active +
    project.workstreamCounts.blocked +
    project.workstreamCounts.todo;
  return (
    <Link
      to="/agent-projects/$projectId"
      params={{ projectId: project.id }}
      className={cn(
        "block rounded-xl border border-transparent px-3 py-2.5 transition-colors",
        "hover:bg-sidebar-accent/60",
        selected && "border-border/60 bg-sidebar-accent/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{project.name}</div>
          <div className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
            {project.notesPreview.length > 0
              ? project.notesPreview
              : "No shared notes yet"}
          </div>
        </div>
        <div className="text-muted-foreground shrink-0 text-right text-xs">
          <div>{project.threadCount} threads</div>
          <div>{active} open</div>
        </div>
      </div>
    </Link>
  );
}

function WorkstreamBoard({
  project,
  environmentId,
  canWrite,
}: {
  project: AgentProject;
  environmentId: EnvironmentId;
  canWrite: boolean;
}) {
  const [title, setTitle] = useState("");
  const upsert = useAtomCommand(agentProjectEnvironment.upsertWorkstream, {
    reportFailure: true,
  });
  const remove = useAtomCommand(agentProjectEnvironment.deleteWorkstream, {
    reportFailure: true,
  });

  const byStatus = useMemo(() => {
    const groups = new Map<
      AgentProjectWorkstreamStatus,
      Array<(typeof project.workstreams)[number]>
    >();
    for (const status of STATUS_ORDER) groups.set(status, []);
    for (const workstream of project.workstreams) {
      groups.get(workstream.status)?.push(workstream);
    }
    return groups;
  }, [project.workstreams]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Status board</h2>
        {canWrite ? (
          <form
            className="flex min-w-0 flex-1 items-center justify-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = title.trim();
              if (trimmed.length === 0) return;
              void upsert({
                environmentId,
                input: {
                  projectId: project.id,
                  title: trimmed,
                  status: "todo",
                },
              }).then((result) => {
                if (result._tag === "Success") setTitle("");
              });
            }}
          >
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add workstream"
              className="max-w-64"
              maxLength={160}
            />
            <Button type="submit" size="sm" disabled={title.trim().length === 0}>
              Add
            </Button>
          </form>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            className="bg-background/40 border-border/50 rounded-xl border p-3 backdrop-blur-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{STATUS_LABEL[status]}</span>
              <span className="text-muted-foreground text-xs">
                {byStatus.get(status)?.length ?? 0}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {(byStatus.get(status) ?? []).map((workstream) => (
                <li
                  key={workstream.id}
                  className="bg-card/50 border-border/40 flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{workstream.title}</div>
                    {canWrite ? (
                      <select
                        className="text-muted-foreground bg-transparent mt-1 text-xs outline-none"
                        value={workstream.status}
                        onChange={(event) => {
                          void upsert({
                            environmentId,
                            input: {
                              projectId: project.id,
                              workstreamId: workstream.id,
                              title: workstream.title,
                              status: event.target.value as AgentProjectWorkstreamStatus,
                            },
                          });
                        }}
                      >
                        {STATUS_ORDER.map((option) => (
                          <option key={option} value={option}>
                            {STATUS_LABEL[option]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-muted-foreground mt-1 text-xs">
                        {STATUS_LABEL[workstream.status]}
                      </div>
                    )}
                  </div>
                  {canWrite ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${workstream.title}`}
                      onClick={() => {
                        void remove({
                          environmentId,
                          input: { projectId: project.id, workstreamId: workstream.id },
                        });
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectDetail({
  environmentId,
  projectId,
  canWrite,
}: {
  environmentId: EnvironmentId;
  projectId: AgentProjectId;
  canWrite: boolean;
}) {
  const detail = useEnvironmentQuery(
    agentProjectEnvironment.get({ environmentId, input: { projectId } }),
  );
  const update = useAtomCommand(agentProjectEnvironment.update, { reportFailure: true });
  const remove = useAtomCommand(agentProjectEnvironment.delete, { reportFailure: true });
  const navigate = useNavigate();
  const project = detail.data;
  const [notes, setNotes] = useState<string | null>(null);

  if (detail.isPending && project === null) {
    return <div className="text-muted-foreground text-sm">Loading project…</div>;
  }
  if (detail.error !== null && project === null) {
    return <div className="text-destructive text-sm">{detail.error}</div>;
  }
  if (project === null) {
    return <div className="text-muted-foreground text-sm">Project not found.</div>;
  }

  const notesValue = notes ?? project.notes;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Project
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
        </div>
        {canWrite ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void remove({ environmentId, input: { projectId: project.id } }).then((result) => {
                if (result._tag === "Success") {
                  void navigate({ to: "/agent-projects" });
                }
              });
            }}
          >
            <Trash2Icon />
            Delete
          </Button>
        ) : null}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Shared notes</h2>
        <Textarea
          value={notesValue}
          disabled={!canWrite}
          rows={10}
          placeholder="Context every agent in this project should share…"
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (!canWrite || notes === null || notes === project.notes) return;
            void update({
              environmentId,
              input: { projectId: project.id, notes },
            });
          }}
        />
      </section>

      <WorkstreamBoard project={project} environmentId={environmentId} canWrite={canWrite} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Threads</h2>
        {project.threads.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Attach threads from the server API or a later UI picker. Membership is stored on this
            environment.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {project.threads.map((thread) => (
              <li
                key={thread.threadId}
                className="bg-background/40 border-border/50 rounded-lg border px-3 py-2 text-sm"
              >
                <code className="text-xs">{thread.threadId}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AgentProjectsPage() {
  const environmentId = useReadableEnvironmentId();
  const params = useParams({ strict: false }) as { projectId?: string };
  const selectedId = (params.projectId as AgentProjectId | undefined) ?? null;
  const { environments } = useEnvironments();
  const writable = useEnvironmentsWithScope(
    environments.filter((environment) => environment.connection.phase === "connected"),
    AuthOrchestrationOperateScope,
  );
  const canWrite = environmentId !== null && writable.has(environmentId);
  const list = useEnvironmentQuery(
    environmentId === null
      ? null
      : agentProjectEnvironment.list({ environmentId, input: undefined }),
  );

  return (
    <SidebarInset className="bg-background/30 min-h-0">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex items-start gap-3">
          <div className="bg-sidebar-accent/70 text-sidebar-foreground flex size-10 items-center justify-center rounded-xl">
            <FolderKanbanIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-muted-foreground text-sm">
              Shared notes, workstreams, and thread membership across agents.
            </p>
          </div>
        </header>

        {environmentId === null ? (
          <p className="text-muted-foreground text-sm">
            Connect an environment to create and browse Projects.
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
            <aside className="border-border/50 bg-background/35 flex min-h-0 flex-col gap-4 rounded-2xl border p-3 backdrop-blur-md">
              <CreateProjectForm environmentId={environmentId} canWrite={canWrite} />
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1 pr-2">
                  {list.isPending && (list.data?.projects.length ?? 0) === 0 ? (
                    <p className="text-muted-foreground px-2 text-sm">Loading…</p>
                  ) : null}
                  {list.error !== null ? (
                    <p className="text-destructive px-2 text-sm">{list.error}</p>
                  ) : null}
                  {(list.data?.projects ?? []).map((project) => (
                    <ProjectListCard
                      key={project.id}
                      project={project}
                      selected={selectedId === project.id}
                    />
                  ))}
                  {list.isSuccess && (list.data?.projects.length ?? 0) === 0 ? (
                    <p className="text-muted-foreground px-2 text-sm">
                      No projects yet. Create one to share context across agents.
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            </aside>
            <main className="border-border/50 bg-background/35 min-h-0 rounded-2xl border p-4 backdrop-blur-md sm:p-6">
              {selectedId === null ? (
                <div className="text-muted-foreground flex h-full min-h-48 items-center justify-center text-sm">
                  Select a project to open its notes and status board.
                </div>
              ) : (
                <ProjectDetail
                  environmentId={environmentId}
                  projectId={selectedId}
                  canWrite={canWrite}
                />
              )}
            </main>
          </div>
        )}
      </div>
    </SidebarInset>
  );
}
