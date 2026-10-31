import { assert, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Sqlite from "../persistence/Sqlite.ts";
import * as AgentProjects from "./AgentProjects.ts";

const layer = it.layer(
  AgentProjects.layer.pipe(Layer.provide(Sqlite.layerMemory), Layer.provide(NodeCrypto.layer)),
);

layer("AgentProjects", (it) => {
  it.effect("creates projects, notes, and workstreams", () =>
    Effect.gen(function* () {
      const projects = yield* AgentProjects.AgentProjects;
      const created = yield* projects.create({ name: "Launch", notes: "Ship L7" });
      assert.equal(created.name, "Launch");
      assert.equal(created.notes, "Ship L7");
      assert.deepEqual(created.workstreams, []);

      const updated = yield* projects.update({
        projectId: created.id,
        notes: "Ship L7 Projects",
      });
      assert.equal(updated.notes, "Ship L7 Projects");

      const withStream = yield* projects.upsertWorkstream({
        projectId: created.id,
        title: "Status board",
        status: "active",
      });
      assert.equal(withStream.workstreams.length, 1);
      assert.equal(withStream.workstreams[0]?.title, "Status board");
      assert.equal(withStream.workstreams[0]?.status, "active");

      const listed = yield* projects.list;
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.workstreamCounts.active, 1);
      assert.isTrue((listed[0]?.notesPreview ?? "").includes("Ship L7 Projects"));

      const removed = yield* projects.delete({ projectId: created.id });
      assert.equal(removed.removed, true);
      assert.deepEqual(yield* projects.list, []);
    }),
  );
});
