import { describe, expect, it } from "@effect/vitest";

import { boatHostUrlToWsBaseUrl } from "./boat.ts";

describe("boatHostUrlToWsBaseUrl", () => {
  it("converts https host URLs to wss and keeps the token", () => {
    expect(
      boatHostUrlToWsBaseUrl("https://swift-otter-9021-3773.on.boat.dev?_token=secret"),
    ).toBe("wss://swift-otter-9021-3773.on.boat.dev/?_token=secret");
  });

  it("converts http to ws", () => {
    expect(boatHostUrlToWsBaseUrl("http://127.0.0.1:3773/")).toBe("ws://127.0.0.1:3773/");
  });
});
