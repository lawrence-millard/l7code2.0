// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "L7CODE_CLERK_PUBLISHABLE_KEY=pk_root\nL7CODE_CLERK_JWT_TEMPLATE=template_root\nL7CODE_CLERK_CLI_OAUTH_CLIENT_ID=oauth_root\nL7CODE_RELAY_URL=https://root.example.test\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env.local"),
      "L7CODE_CLERK_PUBLISHABLE_KEY=pk_local\nL7CODE_CLERK_JWT_TEMPLATE=template_local\nL7CODE_CLERK_CLI_OAUTH_CLIENT_ID=oauth_local\nL7CODE_RELAY_URL=https://local.example.test\n",
    );

    expect(loadRepoEnv({ baseEnv: {}, repoRoot }).L7CODE_RELAY_URL).toBe(
      "https://local.example.test",
    );
    expect(
      loadRepoEnv({
        baseEnv: {
          L7CODE_CLERK_PUBLISHABLE_KEY: "pk_ci",
          L7CODE_CLERK_JWT_TEMPLATE: "template_ci",
          L7CODE_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
          L7CODE_RELAY_URL: "https://ci.example.test",
        },
        repoRoot,
      }),
    ).toMatchObject({
      L7CODE_CLERK_PUBLISHABLE_KEY: "pk_ci",
      L7CODE_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_ci",
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_ci",
      L7CODE_CLERK_JWT_TEMPLATE: "template_ci",
      VITE_CLERK_JWT_TEMPLATE: "template_ci",
      EXPO_PUBLIC_CLERK_JWT_TEMPLATE: "template_ci",
      L7CODE_RELAY_URL: "https://ci.example.test",
      VITE_L7CODE_RELAY_URL: "https://ci.example.test",
    });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "l7code-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
