#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function mergeCueWithNext(cues, cueId) {");
const end = script.indexOf("\n  function offsetCueTimings", start);
assert.notEqual(start, -1, "mergeCueWithNext exists");
assert.notEqual(end, -1, "merge helper extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.mergeCueWithNext = mergeCueWithNext;`, context);

const cues = [
  { id: 8, start: 5, end: 7, text: "Second", x: 60, y: 8, size: 60 },
  { id: 3, start: 1, end: 6, text: "First", x: 20, y: 8, size: 60 }
];
const merged = Array.from(context.mergeCueWithNext(cues, 3), (cue) => ({ ...cue }));
assert.deepEqual(merged, [
  { id: 3, start: 1, end: 7, text: "First\nSecond", x: 20, y: 8, size: 60 }
], "merging combines text, spans the full range, keeps the first cue's id and spatial values, and drops the second cue");
assert.deepEqual(cues, [
  { id: 8, start: 5, end: 7, text: "Second", x: 60, y: 8, size: 60 },
  { id: 3, start: 1, end: 6, text: "First", x: 20, y: 8, size: 60 }
], "source cues are not mutated");

const containedNext = Array.from(context.mergeCueWithNext([
  { id: 1, start: 0, end: 10, text: "Outer", x: 50, y: 8, size: 60 },
  { id: 2, start: 2, end: 4, text: "Inner", x: 50, y: 8, size: 60 }
], 1), (cue) => ({ ...cue }));
assert.deepEqual(containedNext, [
  { id: 1, start: 0, end: 10, text: "Outer\nInner", x: 50, y: 8, size: 60 }
], "the later end wins when the next cue is fully contained inside the current one");

assert.equal(context.mergeCueWithNext(cues, 8), null, "last chronological cue is rejected");
assert.equal(context.mergeCueWithNext(cues, 99), null, "unknown cue is rejected");
assert.equal(context.mergeCueWithNext([{ id: 1, start: 0, end: 1, text: "Only", x: 50, y: 8, size: 60 }], 1), null, "a single cue has no next cue to merge with");

assert.match(script, /data-action="merge-next">Merge with next<\/button>/, "non-final list item exposes merge action");
assert.match(script, /const merged = mergeCueWithNext\(editorCues, id\);/, "action invokes shipped helper");
assert.match(
  script,
  /editorCues = merged;\s*renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);\s*setEditorStatus\("Merged cue with the next cue\."\);/,
  "successful merge refreshes list, preview, persistence, and status"
);
assert.match(script, /if \(editingCueId === id \|\| \(next && editingCueId === next\.id\)\) resetEditorForm\(\{ rollback: false \}\);/, "editing either merged cue resets the form without rollback");
assert.match(script, /cueIndex < sortedCues\.length - 1/, "final chronological cue omits merge action");

console.log("cue merge verification: pass");
