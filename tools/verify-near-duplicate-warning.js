#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const constantStart = script.indexOf("  const NEAR_DUPLICATE_CUE_TOLERANCE_SECONDS");
const functionStart = script.indexOf("  function findNearDuplicateCues(");
const functionEnd = script.indexOf("\n  function findCuesPastVideoEnd(", functionStart);
assert.notEqual(constantStart, -1, "near-duplicate tolerance exists");
assert.notEqual(functionStart, -1, "findNearDuplicateCues exists");
assert.notEqual(functionEnd, -1, "findNearDuplicateCues extraction boundary exists");

const context = {};
vm.runInNewContext(
  `${script.slice(constantStart, script.indexOf("\n", constantStart))}\n${script.slice(functionStart, functionEnd)}\nthis.findNearDuplicateCues = findNearDuplicateCues;`,
  context
);
const cue = (id, start, end, text = "candidate") => ({ id, start, end, text });
const result = (cues) => {
  const duplicates = context.findNearDuplicateCues(cues);
  return { ids: [...duplicates.cueIds].sort((a, b) => a - b), pairs: duplicates.pairCount };
};

assert.deepEqual(result([]), { ids: [], pairs: 0 });
assert.deepEqual(result([cue(1, 1, 2), cue(2, 1, 2, "different generator")]), { ids: [1, 2], pairs: 1 }, "same timing detected regardless of suggestion text");
assert.deepEqual(result([cue(1, 1, 2), cue(2, 1.1, 2.1)]), { ids: [1, 2], pairs: 1 }, "100ms boundary tolerance is inclusive");
assert.deepEqual(result([cue(1, 1, 2), cue(2, 1.101, 2.1)]), { ids: [], pairs: 0 }, "both boundaries must be within tolerance");
assert.deepEqual(result([cue(1, 0, 10), cue(2, 1, 9)]), { ids: [], pairs: 0 }, "ordinary overlap is not a near duplicate");
assert.deepEqual(result([cue(1, 1, 2), cue(2, 1.02, 2.02), cue(3, 1.05, 2.05)]), { ids: [1, 2, 3], pairs: 3 }, "every duplicate pair is counted");

assert.match(script, /nearDuplicates\.cueIds\.has\(cue\.id\)/, "near-duplicate list items are marked");
assert.match(script, /class="vtt-editor__duplicate-warning" role="status" hidden/, "aggregate warning is accessible and initially hidden");
assert.match(script, /duplicateWarning\.hidden = nearDuplicates\.pairCount === 0/, "warning visibility follows detector state");

console.log("near-duplicate warning verification: pass");
