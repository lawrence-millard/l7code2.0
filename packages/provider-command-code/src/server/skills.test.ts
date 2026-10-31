import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { discoverCommandCodeSkills } from "./skills.ts";

describe("discoverCommandCodeSkills", () => {
  // command-code 0.0.13 scans workspace roots from the workspace up to HOME, then
  // ~/.command-code/skills, then home compatibility roots (src/builtins/skills.zig), and
  // lists ~/.command-code/skills first, then workspace roots, then compatibility roots
  // in scan order (skillGroupRank in src/core/skills/skill_runtime.zig).
  it.effect("lists skills in command-code's own order", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // The workspace sits under the fake HOME, so the upward walk stops there.
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-command-code-skills-home-" });
      const parent = path.join(home, "projects");
      const workspace = path.join(parent, "app");
      const writeSkill = (root: string, name: string) =>
        fileSystem
          .makeDirectory(path.join(root, name), { recursive: true })
          .pipe(
            Effect.andThen(
              fileSystem.writeFileString(
                path.join(root, name, "SKILL.md"),
                `---\nname: ${name}\ndescription: ${name} skill\n---\n\nBody.\n`,
              ),
            ),
          );
      yield* writeSkill(path.join(workspace, ".claude/skills"), "workspace-claude");
      yield* writeSkill(path.join(workspace, ".command-code/skills"), "workspace-command-code");
      yield* writeSkill(path.join(parent, ".agents/skills"), "parent-agents");
      yield* writeSkill(path.join(parent, "skills"), "parent-shared");
      yield* writeSkill(path.join(home, ".claude/skills"), "home-claude");
      yield* writeSkill(path.join(home, ".command-code/skills"), "home-command-code");
      // HOME is not a workspace ancestor, and ~/skills is no command-code root.
      yield* writeSkill(path.join(home, "skills"), "home-shared");

      const skills = yield* discoverCommandCodeSkills({ cwd: workspace, environment: { HOME: home } });

      assert.deepEqual(
        skills.map((skill) => skill.name),
        [
          "home-command-code",
          "workspace-command-code",
          "parent-shared",
          "workspace-claude",
          "parent-agents",
          "home-claude",
        ],
      );
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  // For `$review` with two skills of exactly that name, command-code's model loads the
  // first in scan order, so only that one is offered; `Review` is a separate
  // skill `$Review` loads. command-code skips a SKILL.md whose frontmatter has no name
  // or never closes, and a symlinked folder in its managed ~/.command-code/skills.
  it.effect("offers the skill command-code loads for each name", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-command-code-skills-home-" });
      const workspace = path.join(home, "app");
      const writeSkillFile = (folder: string, contents: string) =>
        fileSystem
          .makeDirectory(folder, { recursive: true })
          .pipe(
            Effect.andThen(fileSystem.writeFileString(path.join(folder, "SKILL.md"), contents)),
          );
      yield* writeSkillFile(
        path.join(workspace, ".command-code/skills/review"),
        "---\nname: review\n---\nBody.\n",
      );
      yield* writeSkillFile(path.join(home, ".claude/skills/review"), "---\nname: Review\n---\n");
      yield* writeSkillFile(path.join(home, ".command-code/skills/plain"), "No frontmatter.\n");
      yield* writeSkillFile(
        path.join(home, ".command-code/skills/unnamed"),
        "---\ndescription: Missing name\n---\n",
      );
      yield* writeSkillFile(path.join(home, ".command-code/skills/unclosed"), "---\nname: unclosed\n");
      // A continued plain value is command-code's `unsupported_multiline`, and command-code trims
      // only spaces and tabs, so a trailing vertical tab is a control byte:
      // both these `review`s are invalid and the valid ones stay the only two.
      yield* writeSkillFile(
        path.join(home, ".codex/skills/review"),
        "---\nname: review\u000b\n---\n",
      );
      yield* writeSkillFile(
        path.join(home, ".agents/skills/review"),
        "---\nname: review\ndescription: first line\n  second line\n---\n",
      );
      // command-code sees no frontmatter after a byte-order mark, so this one is
      // `bom-folder`, not `bom-name`, and its body may run past 1 MB.
      yield* fileSystem.makeDirectory(path.join(home, ".command-code/skills/bom-folder"), {
        recursive: true,
      });
      yield* fileSystem.writeFile(
        path.join(home, ".command-code/skills/bom-folder/SKILL.md"),
        new Uint8Array([
          0xef,
          0xbb,
          0xbf,
          ...new TextEncoder().encode(`---\nname: bom-name\n---\n${"x".repeat(1_100_000)}`),
        ]),
      );
      // A literal U+FFFD is valid text to command-code; an invalid UTF-8 byte is not.
      yield* writeSkillFile(
        path.join(home, ".command-code/skills/replacement"),
        "---\nname: replacement\ndescription: Replace \ufffd in imported text.\n---\n",
      );
      yield* fileSystem.makeDirectory(path.join(home, ".command-code/skills/bad-bytes"), { recursive: true });
      yield* fileSystem.writeFile(
        path.join(home, ".command-code/skills/bad-bytes/SKILL.md"),
        new Uint8Array([
          ...new TextEncoder().encode("---\nname: bad"),
          0xff,
          0x0a,
          0x2d,
          0x2d,
          0x2d,
          0x0a,
        ]),
      );
      // command-code folds only ASCII case, so these two are distinct.
      yield* writeSkillFile(
        path.join(home, ".command-code/skills/accent-upper"),
        "---\nname: \u00c9t\u00e9\n---\n",
      );
      yield* writeSkillFile(
        path.join(home, ".command-code/skills/accent-lower"),
        "---\nname: \u00e9t\u00e9\n---\n",
      );
      yield* writeSkillFile(path.join(home, "library/linked"), "---\nname: linked\n---\n");
      yield* fileSystem.symlink(
        path.join(home, "library/linked"),
        path.join(home, ".command-code/skills/linked"),
      );
      yield* fileSystem.makeDirectory(path.join(home, ".command-code/skills/linked-file"));
      yield* fileSystem.symlink(
        path.join(home, "library/linked/SKILL.md"),
        path.join(home, ".command-code/skills/linked-file/SKILL.md"),
      );

      const skills = yield* discoverCommandCodeSkills({ cwd: workspace, environment: { HOME: home } });

      assert.deepEqual(
        skills.map((skill) => [skill.name, skill.path]),
        [
          ["été", path.join(home, ".command-code/skills/accent-lower/SKILL.md")],
          ["Été", path.join(home, ".command-code/skills/accent-upper/SKILL.md")],
          ["bom-folder", path.join(home, ".command-code/skills/bom-folder/SKILL.md")],
          ["plain", path.join(home, ".command-code/skills/plain/SKILL.md")],
          ["replacement", path.join(home, ".command-code/skills/replacement/SKILL.md")],
          ["review", path.join(workspace, ".command-code/skills/review/SKILL.md")],
          ["Review", path.join(home, ".claude/skills/review/SKILL.md")],
        ],
      );
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  // Nix home-manager and dotfile setups link ~/.command-code/skills; command-code then loads
  // nothing from it, while the compatibility roots still count.
  it.effect("lists nothing from a linked ~/.command-code/skills", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-command-code-skills-home-" });
      for (const [root, name] of [
        ["dotfiles/command-code-skills", "managed"],
        [".claude/skills", "compat"],
      ] as const) {
        yield* fileSystem.makeDirectory(path.join(home, root, name), { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(home, root, name, "SKILL.md"),
          `---\nname: ${name}\n---\n`,
        );
      }
      yield* fileSystem.makeDirectory(path.join(home, ".command-code"));
      yield* fileSystem.symlink(
        path.join(home, "dotfiles/command-code-skills"),
        path.join(home, ".command-code/skills"),
      );

      const skills = yield* discoverCommandCodeSkills({
        cwd: path.join(home, "app"),
        environment: { HOME: home },
      });

      assert.deepEqual(
        skills.map((skill) => skill.name),
        ["compat"],
      );
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});
