import { describe, expect, it } from "vitest";

import { sortSessionsByAttention, type ZeronSession } from "./index";

function session(
  partial: Partial<ZeronSession> & Pick<ZeronSession, "threadId" | "attention" | "attentionRank">,
): ZeronSession {
  return {
    environmentId: "env" as ZeronSession["environmentId"],
    spaceId: "env:project",
    title: "Session",
    sortAt: 0,
    preview: null,
    ...partial,
  };
}

describe("sortSessionsByAttention", () => {
  it("ranks approval ahead of idle even when idle is newer", () => {
    const sorted = sortSessionsByAttention([
      session({
        threadId: "idle" as ZeronSession["threadId"],
        attention: "idle",
        attentionRank: 5,
        sortAt: 100,
      }),
      session({
        threadId: "approval" as ZeronSession["threadId"],
        attention: "approval",
        attentionRank: 0,
        sortAt: 1,
      }),
    ]);
    expect(sorted.map((row) => row.threadId)).toEqual(["approval", "idle"]);
  });
});
