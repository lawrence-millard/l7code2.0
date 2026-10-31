import { squashAtomCommandFailure } from "@l7code/client-runtime/state/runtime";
import type { EnvironmentProject } from "@l7code/client-runtime/state/shell";
import type { ModelSelection, ThreadId } from "@l7code/contracts";
import { AsyncResult } from "effect/reactivity";

import { newMessageId, newThreadId } from "~/lib/utils";
import { parseSpaceId } from "./space";
import type { SpaceId } from "./types";

export interface StartSessionTurnArgs {
  readonly spaceId: SpaceId;
  readonly text: string;
  readonly threadId?: ThreadId;
  readonly title?: string;
  readonly project: EnvironmentProject;
  readonly modelSelection: ModelSelection;
  readonly startTurn: (input: {
    readonly environmentId: EnvironmentProject["environmentId"];
    readonly input: {
      readonly threadId: ThreadId;
      readonly message: {
        readonly messageId: ReturnType<typeof newMessageId>;
        readonly role: "user";
        readonly text: string;
        readonly attachments: [];
      };
      readonly modelSelection: ModelSelection;
      readonly runtimeMode: "approval-required";
      readonly interactionMode: "default";
      readonly bootstrap?: {
        readonly createThread: {
          readonly projectId: EnvironmentProject["id"];
          readonly title: string;
          readonly modelSelection: ModelSelection;
          readonly runtimeMode: "approval-required";
          readonly interactionMode: "default";
          readonly branch: null;
          readonly worktreePath: null;
          readonly createdAt: string;
        };
      };
      readonly createdAt?: string;
    };
  }) => Promise<AsyncResult.AsyncResult<unknown, unknown>>;
}

/** Zeron composer send → L7 `startTurn` (+ optional createThread bootstrap). */
export async function startSessionTurn(args: StartSessionTurnArgs): Promise<{
  readonly threadId: ThreadId;
  readonly created: boolean;
}> {
  const parsed = parseSpaceId(args.spaceId);
  if (parsed === null) throw new Error("Invalid space id");
  if (args.project.environmentId !== parsed.environmentId || args.project.id !== parsed.projectId) {
    throw new Error("Space does not match project");
  }

  const created = args.threadId === undefined;
  const threadId = args.threadId ?? newThreadId();
  const title = args.title?.trim() || args.text.trim().slice(0, 72) || "New session";
  const createdAt = new Date().toISOString();

  const result = await args.startTurn({
    environmentId: args.project.environmentId,
    input: {
      threadId,
      message: {
        messageId: newMessageId(),
        role: "user",
        text: args.text,
        attachments: [],
      },
      modelSelection: args.modelSelection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      ...(created
        ? {
            bootstrap: {
              createThread: {
                projectId: args.project.id,
                title,
                modelSelection: args.modelSelection,
                runtimeMode: "approval-required" as const,
                interactionMode: "default" as const,
                branch: null,
                worktreePath: null,
                createdAt,
              },
            },
            createdAt,
          }
        : {}),
    },
  });

  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return { threadId, created };
}
