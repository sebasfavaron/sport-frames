#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  const SHORT_CUE_THRESHOLD_SECONDS");
const end = script.indexOf("\n  function currentScrubTime()", start);
assert.notEqual(start, -1, "SHORT_CUE_THRESHOLD_SECONDS exists");
assert.notEqual(end, -1, "findShortCues extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.findShortCues = findShortCues;`, context);
const result = (cues) => [...context.findShortCues(cues)].sort((a, b) => a - b);

assert.deepEqual(
  result([{ id: 1, start: 0, end: 0.2 }]),
  [],
  "cue duration above threshold emits no warning"
);
assert.deepEqual(
  result([{ id: 1, start: 0, end: 0.15 }]),
  [],
  "cue duration exactly at threshold is valid (not flagged)"
);
assert.deepEqual(
  result([{ id: 1, start: 0, end: 0.1 }]),
  [1],
  "cue duration below threshold is flagged"
);
assert.deepEqual(
  result([{ id: 1, start: 5, end: 5 }]),
  [1],
  "zero-duration cue is flagged"
);
assert.deepEqual(
  result([
    { id: 1, start: 0, end: 10 },
    { id: 2, start: 0, end: 0.05 },
    { id: 3, start: 0, end: 0.2 },
    { id: 4, start: 0, end: 0.149 },
  ]),
  [2, 4],
  "mixed cue set flags only cues below the threshold"
);

assert.match(script, /shortCues\.has\(cue\.id\)/, "short cue list items are marked");
assert.match(script, /Very short cue/, "distinct per-cue warning label is rendered");
assert.match(script, /class="vtt-editor__short-cue-warning" role="status" hidden/, "aggregate warning is accessible");
assert.match(script, /const shortCues = findShortCues\(editorCues\)/, "render path computes short cue warnings");

console.log("short cue warning verification: pass");
