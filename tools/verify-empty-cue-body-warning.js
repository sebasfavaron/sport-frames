#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function findEmptyCueBodies");
const end = script.indexOf("\n  function currentScrubTime()", start);
assert.notEqual(start, -1, "findEmptyCueBodies exists");
assert.notEqual(end, -1, "detector extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.findEmptyCueBodies = findEmptyCueBodies;`, context);
const result = (cues) => [...context.findEmptyCueBodies(cues)].sort((a, b) => a - b);

assert.deepEqual(result([{ id: 1, text: "" }]), [1], "empty text is flagged");
assert.deepEqual(result([{ id: 1, text: "  \n\t" }]), [1], "whitespace-only text is flagged");
assert.deepEqual(result([{ id: 1, text: "TODO" }]), [1], "literal TODO is flagged");
assert.deepEqual(result([{ id: 1, text: " TODO " }]), [1], "trimmed literal TODO is flagged");
assert.deepEqual(result([{ id: 1, text: "TODO: review" }]), [], "real text beginning with TODO is not flagged");
assert.deepEqual(result([{ id: 1, text: "Goal" }]), [], "normal text is not flagged");
assert.deepEqual(result([{ id: 1 }]), [1], "missing text is treated as empty");

assert.match(script, /emptyCueBodies\.has\(cue\.id\)/, "affected list items are marked");
assert.match(script, /Needs annotation text/, "per-cue warning label is rendered");
assert.match(script, /class="vtt-editor__empty-body-warning" role="status" hidden/, "toolbar warning is accessible");
assert.match(script, /const emptyCueBodies = findEmptyCueBodies\(editorCues\)/, "normal render path computes warnings");

console.log("empty cue body warning verification: pass");
