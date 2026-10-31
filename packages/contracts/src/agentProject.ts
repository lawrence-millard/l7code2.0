import * as Schema from "effect/Schema";

import {
  AgentProjectId,
  AgentProjectWorkstreamId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";

/**
 * Cursor-style Project: durable multi-agent workspace with shared notes,
 * thread membership, and a workstream status board. Distinct from the folder
 * registry Project / ProjectId.
 */
export const AgentProjectWorkstreamStatus = Schema.Literals([
  "todo",
  "active",
  "blocked",
  "done",
]);
export type AgentProjectWorkstreamStatus = typeof AgentProjectWorkstreamStatus.Type;

export const AgentProjectWorkstream = Schema.Struct({
  id: AgentProjectWorkstreamId,
  title: TrimmedNonEmptyString,
  status: AgentProjectWorkstreamStatus,
  threadId: Schema.NullOr(ThreadId),
  sortOrder: Schema.Int,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AgentProjectWorkstream = typeof AgentProjectWorkstream.Type;

export const AgentProjectThreadLink = Schema.Struct({
  threadId: ThreadId,
  environmentId: Schema.NullOr(EnvironmentId),
  linkedAt: IsoDateTime,
});
export type AgentProjectThreadLink = typeof AgentProjectThreadLink.Type;

export const AgentProjectFolderLink = Schema.Struct({
  folderProjectId: ProjectId,
  linkedAt: IsoDateTime,
});
export type AgentProjectFolderLink = typeof AgentProjectFolderLink.Type;

export const AgentProject = Schema.Struct({
  id: AgentProjectId,
  name: TrimmedNonEmptyString,
  /** Shared notes / context markdown for agents in this project. */
  notes: TrimmedString,
  threads: Schema.Array(AgentProjectThreadLink),
  folders: Schema.Array(AgentProjectFolderLink),
  workstreams: Schema.Array(AgentProjectWorkstream),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AgentProject = typeof AgentProject.Type;

export const AgentProjectSummary = Schema.Struct({
  id: AgentProjectId,
  name: TrimmedNonEmptyString,
  notesPreview: TrimmedString,
  threadCount: Schema.Int,
  workstreamCounts: Schema.Struct({
    todo: Schema.Int,
    active: Schema.Int,
    blocked: Schema.Int,
    done: Schema.Int,
  }),
  updatedAt: IsoDateTime,
});
export type AgentProjectSummary = typeof AgentProjectSummary.Type;

export const AgentProjectCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  notes: Schema.optionalKey(TrimmedString),
});
export type AgentProjectCreateInput = typeof AgentProjectCreateInput.Type;

export const AgentProjectUpdateInput = Schema.Struct({
  projectId: AgentProjectId,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  notes: Schema.optionalKey(TrimmedString),
});
export type AgentProjectUpdateInput = typeof AgentProjectUpdateInput.Type;

export const AgentProjectDeleteInput = Schema.Struct({
  projectId: AgentProjectId,
});
export type AgentProjectDeleteInput = typeof AgentProjectDeleteInput.Type;

export const AgentProjectGetInput = Schema.Struct({
  projectId: AgentProjectId,
});
export type AgentProjectGetInput = typeof AgentProjectGetInput.Type;

export const AgentProjectAttachThreadInput = Schema.Struct({
  projectId: AgentProjectId,
  threadId: ThreadId,
  environmentId: Schema.optionalKey(EnvironmentId),
});
export type AgentProjectAttachThreadInput = typeof AgentProjectAttachThreadInput.Type;

export const AgentProjectDetachThreadInput = Schema.Struct({
  projectId: AgentProjectId,
  threadId: ThreadId,
});
export type AgentProjectDetachThreadInput = typeof AgentProjectDetachThreadInput.Type;

export const AgentProjectAttachFolderInput = Schema.Struct({
  projectId: AgentProjectId,
  folderProjectId: ProjectId,
});
export type AgentProjectAttachFolderInput = typeof AgentProjectAttachFolderInput.Type;

export const AgentProjectDetachFolderInput = Schema.Struct({
  projectId: AgentProjectId,
  folderProjectId: ProjectId,
});
export type AgentProjectDetachFolderInput = typeof AgentProjectDetachFolderInput.Type;

export const AgentProjectUpsertWorkstreamInput = Schema.Struct({
  projectId: AgentProjectId,
  workstreamId: Schema.optionalKey(AgentProjectWorkstreamId),
  title: TrimmedNonEmptyString,
  status: AgentProjectWorkstreamStatus,
  threadId: Schema.optionalKey(Schema.NullOr(ThreadId)),
  sortOrder: Schema.optionalKey(Schema.Int),
});
export type AgentProjectUpsertWorkstreamInput = typeof AgentProjectUpsertWorkstreamInput.Type;

export const AgentProjectDeleteWorkstreamInput = Schema.Struct({
  projectId: AgentProjectId,
  workstreamId: AgentProjectWorkstreamId,
});
export type AgentProjectDeleteWorkstreamInput = typeof AgentProjectDeleteWorkstreamInput.Type;

export class AgentProjectError extends Schema.TaggedError<AgentProjectError>()(
  "AgentProjectError",
  {
    reason: Schema.Literals(["not_found", "storage", "invalid"]),
    message: Schema.String,
    projectId: Schema.optionalKey(AgentProjectId),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}
