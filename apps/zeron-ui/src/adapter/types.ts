import type { EnvironmentId, ProjectId, ThreadId } from "@l7code/contracts";

/** Zeron space = L7 environment + project pair. */
export type SpaceId = `${string}:${string}`;

export interface ZeronSpace {
  readonly spaceId: SpaceId;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly label: string;
  readonly workspaceRoot: string;
  readonly environmentLabel: string;
}

export type SessionAttention =
  | "approval"
  | "input"
  | "request"
  | "working"
  | "error"
  | "idle"
  | "settled";

export interface ZeronSession {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly attention: SessionAttention;
  readonly attentionRank: number;
  readonly sortAt: number;
  readonly preview: string | null;
}

export interface ZeronSendTurnInput {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly spaceId: SpaceId;
  readonly text: string;
  /** Create the thread on first send when absent. */
  readonly create?: boolean;
  readonly title?: string;
}
