import { describe, expect, it } from "vitest";

import { sortThreadsForSidebar, type SidebarThreadStatus } from "./Sidebar.logic";

function runtimeFor(status: SidebarThreadStatus) {
  if (status === "working") {
    return {
      status: "running" as const,
      activeRunId: null,
      providerInstanceId: "provider",
      providerName: "dev",
      lastError: null,
      lastErrorClass: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
  if (status === "failed") {
    return {
      status: "failed" as const,
      activeRunId: null,
      providerInstanceId: "provider",
      providerName: "dev",
      lastError: "failed",
      lastErrorClass: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
  if (status === "limited") {
    return {
      status: "failed" as const,
      activeRunId: null,
      providerInstanceId: "provider",
      providerName: "dev",
      lastError: "limited",
      lastErrorClass: "usage_limit" as const,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
  if (status === "waiting") {
    return {
      status: "idle" as const,
      activeRunId: null,
      providerInstanceId: "provider",
      providerName: "dev",
      lastError: null,
      lastErrorClass: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
  return null;
}

function thread(
  id: string,
  status: SidebarThreadStatus,
  extras: Partial<{
    activeOrderKey: string | null;
    updatedAt: string;
  }> = {},
) {
  return {
    id,
    activeOrderKey: extras.activeOrderKey ?? null,
    updatedAt: extras.updatedAt ?? "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasPendingApprovals: status === "approval",
    hasPendingUserInput: status === "input",
    pendingSubagentRequest: null,
    pendingGuestMessageCount: status === "request" ? 1 : 0,
    blockedOnThreadWait: status === "waiting",
    runtime: runtimeFor(status),
  };
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
