import { describe, expect, it } from "@effect/vitest";

import { hasCloudPublicConfig } from "./publicConfig.ts";

describe("hasCloudPublicConfig", () => {
  it("is always false after L7 Connect removal", () => {
    expect(hasCloudPublicConfig).toBe(false);
  });
});
