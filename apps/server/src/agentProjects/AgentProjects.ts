import {
  type AgentProject,
  type AgentProjectAttachFolderInput,
  type AgentProjectAttachThreadInput,
  type AgentProjectCreateInput,
  type AgentProjectDeleteInput,
  type AgentProjectDeleteWorkstreamInput,
  type AgentProjectDetachFolderInput,
  type AgentProjectDetachThreadInput,
  AgentProjectError,
  type AgentProjectGetInput,
  type AgentProjectId,
  type AgentProjectSummary,
  type AgentProjectUpdateInput,
  type AgentProjectUpsertWorkstreamInput,
  type AgentProjectWorkstream,
  type AgentProjectWorkstreamId,
  type AgentProjectWorkstreamStatus,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
} from "@l7code/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly notes: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ThreadRow {
  readonly project_id: string;
  readonly thread_id: string;
  readonly environment_id: string | null;
  readonly linked_at: string;
}

interface FolderRow {
  readonly project_id: string;
  readonly folder_project_id: string;
  readonly linked_at: string;
}

interface WorkstreamRow {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly status: string;
  readonly thread_id: string | null;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const WORKSTREAM_STATUSES = new Set<AgentProjectWorkstreamStatus>([
  "todo",
  "active",
  "blocked",
  "done",
]);

const failStorage = (cause: unknown) =>
  Effect.logWarning("Agent project storage failed", cause).pipe(
    Effect.andThen(
      Effect.fail(
        new AgentProjectError({
          reason: "storage",
          message: "Could not read or write Projects. Try again.",
          cause,
        }),
      ),
    ),
  );

const notFound = (projectId: AgentProjectId) =>
  new AgentProjectError({
    reason: "not_found",
    message: `Project ${projectId} was not found.`,
    projectId,
  });

const decodeWorkstreamStatus = (value: string): AgentProjectWorkstreamStatus =>
  WORKSTREAM_STATUSES.has(value as AgentProjectWorkstreamStatus)
    ? (value as AgentProjectWorkstreamStatus)
    : "todo";

const toWorkstream = (row: WorkstreamRow): AgentProjectWorkstream => ({
  id: row.id as AgentProjectWorkstreamId,
  title: row.title,
  status: decodeWorkstreamStatus(row.status),
  threadId: (row.thread_id as ThreadId | null) ?? null,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const notesPreview = (notes: string) => {
  const trimmed = notes.trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157).trimEnd()}…`;
};

const emptyCounts = () => ({ todo: 0, active: 0, blocked: 0, done: 0 });

export class AgentProjects extends Context.Service<
  AgentProjects,
  {
    readonly list: Effect.Effect<ReadonlyArray<AgentProjectSummary>, AgentProjectError>;
    readonly get: (
      input: AgentProjectGetInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly create: (
      input: AgentProjectCreateInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly update: (
      input: AgentProjectUpdateInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly delete: (
      input: AgentProjectDeleteInput,
    ) => Effect.Effect<{ readonly removed: boolean }, AgentProjectError>;
    readonly attachThread: (
      input: AgentProjectAttachThreadInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly detachThread: (
      input: AgentProjectDetachThreadInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly attachFolder: (
      input: AgentProjectAttachFolderInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly detachFolder: (
      input: AgentProjectDetachFolderInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly upsertWorkstream: (
      input: AgentProjectUpsertWorkstreamInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
    readonly deleteWorkstream: (
      input: AgentProjectDeleteWorkstreamInput,
    ) => Effect.Effect<AgentProject, AgentProjectError>;
  }
>()("l7/agentProjects/AgentProjects") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;

  const allocateId = () => crypto.randomUUIDv4().pipe(Effect.catch(failStorage));

  const readProjectRow = Effect.fn("AgentProjects.readProjectRow")(function* (
    projectId: AgentProjectId,
  ) {
    return yield* sql<ProjectRow>`
      SELECT id, name, notes, created_at, updated_at
      FROM agent_projects
      WHERE id = ${projectId}
    `.pipe(
      Effect.map((rows) => Option.fromNullishOr(rows[0])),
      Effect.catch(failStorage),
    );
  });

  const loadDetail = Effect.fn("AgentProjects.loadDetail")(function* (projectId: AgentProjectId) {
    const row = yield* readProjectRow(projectId);
    if (Option.isNone(row)) return yield* notFound(projectId);
    const [threads, folders, workstreams] = yield* Effect.all(
      [
        sql<ThreadRow>`
          SELECT project_id, thread_id, environment_id, linked_at
          FROM agent_project_threads
          WHERE project_id = ${projectId}
          ORDER BY linked_at, thread_id
        `.pipe(Effect.catch(failStorage)),
        sql<FolderRow>`
          SELECT project_id, folder_project_id, linked_at
          FROM agent_project_folders
          WHERE project_id = ${projectId}
          ORDER BY linked_at, folder_project_id
        `.pipe(Effect.catch(failStorage)),
        sql<WorkstreamRow>`
          SELECT id, project_id, title, status, thread_id, sort_order, created_at, updated_at
          FROM agent_project_workstreams
          WHERE project_id = ${projectId}
          ORDER BY sort_order, created_at, id
        `.pipe(Effect.catch(failStorage)),
      ],
      { concurrency: "unbounded" },
    );
    const project: AgentProject = {
      id: row.value.id as AgentProjectId,
      name: row.value.name,
      notes: row.value.notes,
      threads: threads.map((thread) => ({
        threadId: thread.thread_id as ThreadId,
        environmentId: (thread.environment_id as EnvironmentId | null) ?? null,
        linkedAt: thread.linked_at,
      })),
      folders: folders.map((folder) => ({
        folderProjectId: folder.folder_project_id as ProjectId,
        linkedAt: folder.linked_at,
      })),
      workstreams: workstreams.map(toWorkstream),
      createdAt: row.value.created_at,
      updatedAt: row.value.updated_at,
    };
    return project;
  });

  const touchUpdatedAt = Effect.fn("AgentProjects.touchUpdatedAt")(function* (
    projectId: AgentProjectId,
    updatedAt: string,
  ) {
    yield* sql`
      UPDATE agent_projects SET updated_at = ${updatedAt} WHERE id = ${projectId}
    `.pipe(Effect.catch(failStorage), Effect.asVoid);
  });

  const list = Effect.fn("AgentProjects.list")(function* () {
    const projects = yield* sql<ProjectRow>`
      SELECT id, name, notes, created_at, updated_at
      FROM agent_projects
      ORDER BY updated_at DESC, name COLLATE NOCASE, id
    `.pipe(Effect.catch(failStorage));
    if (projects.length === 0) return [] as ReadonlyArray<AgentProjectSummary>;

    const [threadCounts, workstreamRows] = yield* Effect.all(
      [
        sql<{ readonly project_id: string; readonly count: number }>`
          SELECT project_id, COUNT(*) AS count
          FROM agent_project_threads
          GROUP BY project_id
        `.pipe(Effect.catch(failStorage)),
        sql<{ readonly project_id: string; readonly status: string; readonly count: number }>`
          SELECT project_id, status, COUNT(*) AS count
          FROM agent_project_workstreams
          GROUP BY project_id, status
        `.pipe(Effect.catch(failStorage)),
      ],
      { concurrency: "unbounded" },
    );

    const threadsByProject = new Map(threadCounts.map((row) => [row.project_id, row.count]));
    const workstreamsByProject = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const row of workstreamRows) {
      const counts = workstreamsByProject.get(row.project_id) ?? emptyCounts();
      const status = decodeWorkstreamStatus(row.status);
      counts[status] = row.count;
      workstreamsByProject.set(row.project_id, counts);
    }

    return projects.map(
      (project): AgentProjectSummary => ({
        id: project.id as AgentProjectId,
        name: project.name,
        notesPreview: notesPreview(project.notes),
        threadCount: threadsByProject.get(project.id) ?? 0,
        workstreamCounts: workstreamsByProject.get(project.id) ?? emptyCounts(),
        updatedAt: project.updated_at,
      }),
    );
  });

  const get = Effect.fn("AgentProjects.get")(function* (input: AgentProjectGetInput) {
    return yield* loadDetail(input.projectId);
  });

  const create = Effect.fn("AgentProjects.create")(function* (input: AgentProjectCreateInput) {
    const id = (yield* allocateId()) as AgentProjectId;
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO agent_projects (id, name, notes, created_at, updated_at)
      VALUES (${id}, ${input.name}, ${input.notes ?? ""}, ${now}, ${now})
    `.pipe(Effect.catch(failStorage));
    return yield* loadDetail(id);
  });

  const update = Effect.fn("AgentProjects.update")(function* (input: AgentProjectUpdateInput) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    if (input.name === undefined && input.notes === undefined) {
      return yield* loadDetail(input.projectId);
    }
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      UPDATE agent_projects
      SET
        name = ${input.name ?? existing.value.name},
        notes = ${input.notes ?? existing.value.notes},
        updated_at = ${now}
      WHERE id = ${input.projectId}
    `.pipe(Effect.catch(failStorage));
    return yield* loadDetail(input.projectId);
  });

  const remove = Effect.fn("AgentProjects.delete")(function* (input: AgentProjectDeleteInput) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return { removed: false };
    yield* sql`DELETE FROM agent_projects WHERE id = ${input.projectId}`.pipe(
      Effect.catch(failStorage),
    );
    return { removed: true };
  });

  const attachThread = Effect.fn("AgentProjects.attachThread")(function* (
    input: AgentProjectAttachThreadInput,
  ) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO agent_project_threads (project_id, thread_id, environment_id, linked_at)
      VALUES (
        ${input.projectId},
        ${input.threadId},
        ${input.environmentId ?? null},
        ${now}
      )
      ON CONFLICT (project_id, thread_id) DO UPDATE SET
        environment_id = COALESCE(excluded.environment_id, agent_project_threads.environment_id)
    `.pipe(Effect.catch(failStorage));
    yield* touchUpdatedAt(input.projectId, now);
    return yield* loadDetail(input.projectId);
  });

  const detachThread = Effect.fn("AgentProjects.detachThread")(function* (
    input: AgentProjectDetachThreadInput,
  ) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      DELETE FROM agent_project_threads
      WHERE project_id = ${input.projectId} AND thread_id = ${input.threadId}
    `.pipe(Effect.catch(failStorage));
    yield* touchUpdatedAt(input.projectId, now);
    return yield* loadDetail(input.projectId);
  });

  const attachFolder = Effect.fn("AgentProjects.attachFolder")(function* (
    input: AgentProjectAttachFolderInput,
  ) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO agent_project_folders (project_id, folder_project_id, linked_at)
      VALUES (${input.projectId}, ${input.folderProjectId}, ${now})
      ON CONFLICT (project_id, folder_project_id) DO NOTHING
    `.pipe(Effect.catch(failStorage));
    yield* touchUpdatedAt(input.projectId, now);
    return yield* loadDetail(input.projectId);
  });

  const detachFolder = Effect.fn("AgentProjects.detachFolder")(function* (
    input: AgentProjectDetachFolderInput,
  ) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      DELETE FROM agent_project_folders
      WHERE project_id = ${input.projectId} AND folder_project_id = ${input.folderProjectId}
    `.pipe(Effect.catch(failStorage));
    yield* touchUpdatedAt(input.projectId, now);
    return yield* loadDetail(input.projectId);
  });

  const upsertWorkstream = Effect.fn("AgentProjects.upsertWorkstream")(function* (
    input: AgentProjectUpsertWorkstreamInput,
  ) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    const now = DateTime.formatIso(yield* DateTime.now);
    if (input.workstreamId !== undefined) {
      const current = yield* sql<WorkstreamRow>`
        SELECT id, project_id, title, status, thread_id, sort_order, created_at, updated_at
        FROM agent_project_workstreams
        WHERE id = ${input.workstreamId} AND project_id = ${input.projectId}
      `.pipe(Effect.catch(failStorage));
      const row = current[0];
      if (row === undefined) {
        return yield* new AgentProjectError({
          reason: "not_found",
          message: `Workstream ${input.workstreamId} was not found.`,
          projectId: input.projectId,
        });
      }
      const nextThreadId = input.threadId === undefined ? row.thread_id : input.threadId;
      const nextSortOrder = input.sortOrder ?? row.sort_order;
      yield* sql`
        UPDATE agent_project_workstreams
        SET
          title = ${input.title},
          status = ${input.status},
          thread_id = ${nextThreadId},
          sort_order = ${nextSortOrder},
          updated_at = ${now}
        WHERE id = ${input.workstreamId} AND project_id = ${input.projectId}
      `.pipe(Effect.catch(failStorage));
    } else {
      const id = (yield* allocateId()) as AgentProjectWorkstreamId;
      const sortOrder =
        input.sortOrder ??
        (yield* sql<{ readonly max_sort: number | null }>`
          SELECT MAX(sort_order) AS max_sort
          FROM agent_project_workstreams
          WHERE project_id = ${input.projectId}
        `.pipe(
          Effect.map((rows) => (rows[0]?.max_sort ?? -1) + 1),
          Effect.catch(failStorage),
        ));
      yield* sql`
        INSERT INTO agent_project_workstreams (
          id, project_id, title, status, thread_id, sort_order, created_at, updated_at
        ) VALUES (
          ${id},
          ${input.projectId},
          ${input.title},
          ${input.status},
          ${input.threadId === undefined ? null : input.threadId},
          ${sortOrder},
          ${now},
          ${now}
        )
      `.pipe(Effect.catch(failStorage));
    }
    yield* touchUpdatedAt(input.projectId, now);
    return yield* loadDetail(input.projectId);
  });

  const deleteWorkstream = Effect.fn("AgentProjects.deleteWorkstream")(function* (
    input: AgentProjectDeleteWorkstreamInput,
  ) {
    const existing = yield* readProjectRow(input.projectId);
    if (Option.isNone(existing)) return yield* notFound(input.projectId);
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      DELETE FROM agent_project_workstreams
      WHERE id = ${input.workstreamId} AND project_id = ${input.projectId}
    `.pipe(Effect.catch(failStorage));
    yield* touchUpdatedAt(input.projectId, now);
    return yield* loadDetail(input.projectId);
  });

  return AgentProjects.of({
    list: list(),
    get,
    create,
    update,
    delete: remove,
    attachThread,
    detachThread,
    attachFolder,
    detachFolder,
    upsertWorkstream,
    deleteWorkstream,
  });
});

export const layer = Layer.effect(AgentProjects, make);
