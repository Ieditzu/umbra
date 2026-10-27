import assert from "node:assert/strict";
import test from "node:test";
import { TreeCatalog } from "./tree-catalog.mjs";
import { project } from "../../mobile/src/engine/geometry.ts";

test("catalog selects local tree and intersecting row segments without unrelated cities", () => {
  const catalog = new TreeCatalog({
    schema_version: 1,
    timestamp: "synthetic",
    trees: [
      [1, 28.64, 44.175, "10", "6", "deciduous", ""],
      [2, 26.1, 44.43, "", "", "", ""],
    ],
    rows: [
      [
        3,
        [
          [28.639, 44.175],
          [28.641, 44.175],
        ],
        "8",
        "6",
        "",
        "",
      ],
    ],
  });
  const p = project({ latitude: 44.175, longitude: 28.64 });
  const result = catalog.forArea({
    west: p.x - 200,
    east: p.x + 200,
    south: p.y - 200,
    north: p.y + 200,
  });
  assert.ok(result.some((item) => item.id === "tree-1"));
  assert.ok(result.some((item) => item.id.startsWith("row-3-")));
  assert.ok(!result.some((item) => item.id === "tree-2"));
  assert.equal(new Set(result.map((item) => item.id)).size, result.length);
});
