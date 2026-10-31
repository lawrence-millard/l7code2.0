import type { EnvironmentThreadShell } from "@l7code/client-runtime/state/shell";
import * as DateTime from "effect/DateTime";

import { spaceIdFor } from "./space";
import type { SessionAttention, ZeronSession } from "./types";

const ATTENTION_RANK: Record<SessionAttention, number> = {
  approval: 0,
  input: 1,
  request: 2,
  working: 3,
  error: 4,
  idle: 5,
  settled: 6,
};

function utcMillis(value: DateTime.Utc | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return DateTime.toEpochMillis(value);
}

/** Map L7 thread shell → Zeron session attention (UI-only; no new RPC fields). */
export function resolveSessionAttention(shell: EnvironmentThreadShell): SessionAttention {
  if (shell.hasPendingApprovals || shell.pendingSubagentRequest === "approval") return "approval";
  if (shell.hasPendingUserInput || shell.pendingSubagentRequest === "user_input") return "input";
  if ((shell.pendingGuestMessageCount ?? 0) > 0) return "request";
  const runtimeStatus = shell.runtime?.status;
  if (runtimeStatus === "failed") return "error";
  if (
    runtimeStatus === "running" ||
    runtimeStatus === "starting" ||
    runtimeStatus === "queued" ||
    runtimeStatus === "preparing" ||
    runtimeStatus === "waiting"
  ) {
    return "working";
  }
  if (shell.settledAt != null || shell.archivedAt != null) return "settled";
  return "idle";
}

export function threadShellToSession(shell: EnvironmentThreadShell): ZeronSession {
  const attention = resolveSessionAttention(shell);
  const sortAt = Math.max(
    utcMillis(shell.latestUserMessageAt),
    utcMillis(shell.updatedAt),
    utcMillis(shell.createdAt),
    utcMillis(shell.settledAt),
  );
  const preview = shell.source.latestVisibleMessage?.text?.trim() || null;
  return {
    environmentId: shell.environmentId,
    threadId: shell.id,
    spaceId: spaceIdFor(shell.environmentId, shell.projectId),
    title: shell.title?.trim() || "Untitled session",
    attention,
    attentionRank: ATTENTION_RANK[attention],
    sortAt,
    preview,
  };
}

/** Attention-first, then recency — Zeron sidebar session order. */
export function sortSessionsByAttention(
  sessions: ReadonlyArray<ZeronSession>,
): ZeronSession[] {
  return [...sessions].sort((a, b) => {
    if (a.attentionRank !== b.attentionRank) return a.attentionRank - b.attentionRank;
    return b.sortAt - a.sortAt;
  });
}
