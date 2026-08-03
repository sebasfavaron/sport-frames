#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function findCuesPastVideoEnd(");
const end = script.indexOf("\n  function currentScrubTime()", start);
assert.notEqual(start, -1, "findCuesPastVideoEnd exists");
assert.notEqual(end, -1, "findCuesPastVideoEnd extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.findCuesPastVideoEnd = findCuesPastVideoEnd;`, context);
const cues = [
  { id: 1, start: 0, end: 10 },
  { id: 2, start: 9, end: 11 },
  { id: 3, start: 11, end: 12 },
];
const result = (duration) => [...context.findCuesPastVideoEnd(cues, duration)].sort((a, b) => a - b);

assert.deepEqual(result(undefined), [], "unknown duration emits no warning");
assert.deepEqual(result(Number.NaN), [], "NaN duration emits no warning");
assert.deepEqual(result(12), [], "cues inside duration emit no warning");
assert.deepEqual(result(10), [2, 3], "end and start past duration are detected");
assert.deepEqual(
  [...context.findCuesPastVideoEnd([{ id: 1, start: 0, end: 10 }], 10)],
  [],
  "cue ending exactly at duration is valid"
);

assert.match(script, /pastVideoEnd\.has\(cue\.id\)/, "out-of-range list items are marked");
assert.match(script, /Extends past video end/, "clear per-cue warning is rendered");
assert.match(script, /class="vtt-editor__duration-warning" role="status" hidden/, "aggregate warning is accessible");
assert.match(script, /video\.addEventListener\("durationchange", renderEditorCues\)/, "warnings refresh when video duration changes");
assert.match(script, /parsed\.forEach[\s\S]*?renderEditorCues\(\)/, "import uses warning render path");

console.log("duration bounds warning verification: pass");
