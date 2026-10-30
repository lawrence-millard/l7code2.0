import { describe, expect, it } from "vitest";

import { sortThreadsForSidebar, type SidebarThreadStatus } from "./Sidebar.logic";

function thread(
  id: string,
  status: SidebarThreadStatus,
  extras: Partial<{
    activeOrderKey: string | null;
    updatedAt: string;
  }> = {},
) {
  const base = {
    id,
    activeOrderKey: extras.activeOrderKey ?? null,
    updatedAt: extras.updatedAt ?? "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasPendingApprovals: status === "approval",
    hasPendingUserInput: status === "input",
    pendingSubagentRequest: null as null,
    pendingGuestMessageCount: status === "request" ? 1 : 0,
    blockedOnThreadWait: status === "waiting",
    runtime:
      status === "working"
        ? { status: "running" as const, lastErrorClass: null }
        : status === "failed"
          ? { status: "failed" as const, lastErrorClass: null }
          : status === "limited"
            ? { status: "failed" as const, lastErrorClass: "usage_limit" as const }
            : status === "waiting"
              ? { status: "idle" as const, lastErrorClass: null }
              : null,
  };
  return base;
}

describe("sortThreadsForSidebar attention", () => {
  it("ranks approval and input above working and ready", () => {
    const sorted = sortThreadsForSidebar([
      thread("ready", "ready", { updatedAt: "2026-01-03T00:00:00.000Z" }),
      thread("working", "working", { updatedAt: "2026-01-04T00:00:00.000Z" }),
      thread("approval", "approval", { updatedAt: "2026-01-01T00:00:00.000Z" }),
      thread("input", "input", { updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["approval", "input", "working", "ready"]);
  });
});
