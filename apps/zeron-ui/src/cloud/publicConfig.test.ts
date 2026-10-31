import { describe, expect, it } from "vitest";

import { hasCloudPublicConfig } from "./publicConfig.ts";

describe("hasCloudPublicConfig", () => {
  it("is always false after L7 Connect removal", () => {
    expect(hasCloudPublicConfig()).toBe(false);
  });
});
