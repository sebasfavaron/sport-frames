#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function findCueOverlaps(");
const end = script.indexOf("\n  function currentScrubTime()", start);
assert.notEqual(start, -1, "findCueOverlaps exists");
assert.notEqual(end, -1, "findCueOverlaps extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.findCueOverlaps = findCueOverlaps;`, context);
const cue = (id, start, end) => ({ id, start, end });
const result = (cues) => {
  const overlap = context.findCueOverlaps(cues);
  return { ids: [...overlap.cueIds].sort((a, b) => a - b), pairs: overlap.pairCount };
};

assert.deepEqual(result([]), { ids: [], pairs: 0 });
assert.deepEqual(result([cue(1, 0, 1), cue(2, 1, 2)]), { ids: [], pairs: 0 }, "touching edges are not overlaps");
assert.deepEqual(result([cue(2, 2, 4), cue(1, 1, 3)]), { ids: [1, 2], pairs: 1 }, "unsorted overlap detected");
assert.deepEqual(
  result([cue(1, 0, 10), cue(2, 1, 2), cue(3, 3, 4)]),
  { ids: [1, 2, 3], pairs: 2 },
  "one long cue reports each overlapping pair"
);
assert.deepEqual(
  result([cue(1, 0, 5), cue(2, 1, 4), cue(3, 2, 3)]),
  { ids: [1, 2, 3], pairs: 3 },
  "all pairwise overlaps counted"
);

assert.match(script, /overlaps\.cueIds\.has\(cue\.id\)/, "overlapping list items are marked");
assert.match(script, /class="vtt-editor__overlap-warning" role="status" hidden/, "aggregate warning is accessible and initially hidden");
assert.match(script, /warning\.hidden = overlaps\.pairCount === 0/, "warning visibility follows overlap state");

console.log("overlap warning verification: pass");
