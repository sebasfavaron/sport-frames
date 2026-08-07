#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  const SHORT_CUE_THRESHOLD_SECONDS");
const end = script.indexOf("\n  function currentScrubTime()", start);
assert.notEqual(start, -1, "warning thresholds exist");
assert.notEqual(end, -1, "detector extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.findFastReadingCues = findFastReadingCues;`, context);
const result = (cues) => [...context.findFastReadingCues(cues)].sort((a, b) => a - b);

assert.deepEqual(result([{ id: 1, start: 0, end: 2, text: "Readable annotation" }]), [], "ordinary reading speed is valid");
assert.deepEqual(result([{ id: 1, start: 0, end: 1, text: "12345678901234567890" }]), [], "exact 20 cps boundary is valid");
assert.deepEqual(result([{ id: 1, start: 0, end: 1, text: "123456789012345678901" }]), [1], "above 20 cps is flagged");
assert.deepEqual(result([{ id: 1, start: 2, end: 3, text: "  12345678901234567890  " }]), [], "outer whitespace is excluded");
assert.deepEqual(result([{ id: 1, start: 2, end: 2, text: "dense" }]), [], "invalid zero duration does not produce a misleading speed warning");
assert.deepEqual(result([{ id: 1, start: 0, end: 0.5, text: "eleven chars" }, { id: 2, start: 0, end: 5, text: "eleven chars" }]), [1], "mixed cues flag only excessive reading speed");

assert.match(script, /fastReadingCues\.has\(cue\.id\)/, "affected list items are marked");
assert.match(script, /High reading speed/, "per-cue warning label is rendered");
assert.match(script, /class="vtt-editor__reading-speed-warning" role="status" hidden/, "aggregate warning is accessible");
assert.match(script, /const fastReadingCues = findFastReadingCues\(editorCues\)/, "render path computes reading-speed warnings");

console.log("reading speed warning verification: pass");
