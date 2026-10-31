import { describe, expect, it } from "@effect/vitest";

import { resolveCommandCodeBinary } from "./binary.ts";

describe("resolveCommandCodeBinary", () => {
  it("uses an explicit path", () => {
    expect(resolveCommandCodeBinary("/opt/cmd")).toBe("/opt/cmd");
  });

  it("prefers cmdc on Windows", () => {
    expect(resolveCommandCodeBinary(undefined, "win32")).toBe("cmdc");
  });

  it("prefers cmd on unix", () => {
    expect(resolveCommandCodeBinary(null, "linux")).toBe("cmd");
    expect(resolveCommandCodeBinary("", "darwin")).toBe("cmd");
  });
});
