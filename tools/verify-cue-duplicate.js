#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function duplicateCue(cue, id) {");
const end = script.indexOf("\n  function findCueBodiesWithBlankLines", start);
assert.notEqual(start, -1, "duplicateCue exists");
assert.notEqual(end, -1, "duplicateCue extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.duplicateCue = duplicateCue;`, context);

const original = { id: 1, start: 2, end: 5, text: "Goal!", x: 30, y: 12, size: 40 };
const clone = { ...context.duplicateCue(original, 99) };

assert.deepEqual(
  clone,
  { id: 99, start: 5, end: 8, text: "Goal!", x: 30, y: 12, size: 40 },
  "clone starts where the original ends, preserves duration, text, and spatial position, and takes the supplied id"
);
assert.notEqual(clone, original, "clone is a distinct object from the original cue");

const zeroDuration = { ...context.duplicateCue({ id: 2, start: 4, end: 4, text: "x", x: 50, y: 8, size: 60 }, 7) };
assert.deepEqual(
  zeroDuration,
  { id: 7, start: 4, end: 4, text: "x", x: 50, y: 8, size: 60 },
  "zero-duration cue clones back-to-back at the same instant instead of throwing or growing"
);

assert.match(script, /data-action="duplicate">Duplicate<\/button>/, "list item exposes a Duplicate action");
assert.match(
  script,
  /button\.dataset\.action === "duplicate"\) \{\s*\n\s*const clone = duplicateCue\(cue, nextCueId\+\+\);\s*\n\s*editorCues\.push\(clone\);\s*\n\s*renderEditorCues\(\);\s*\n\s*updateVttAnnotation\(\);\s*\n\s*saveEditorCues\(\);/,
  "click handler clones the cue, appends it, re-renders, refreshes the live preview, and persists it"
);
assert.match(script, /Duplicated cue at \$\{vttTimestamp\(clone\.start\)\}/, "status line reports the new cue's start time");

console.log("cue duplicate verification: pass");
