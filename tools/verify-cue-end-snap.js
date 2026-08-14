#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function snapCueEndToNextStart(cues, cueId) {");
const end = script.indexOf("\n  function offsetCueTimings", start);
assert.notEqual(start, -1, "snapCueEndToNextStart exists");
assert.notEqual(end, -1, "snap helper extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.snapCueEndToNextStart = snapCueEndToNextStart;`, context);
const cues = [
  { id: 8, start: 5, end: 7, text: "Next", x: 60 },
  { id: 3, start: 1, end: 6, text: "First", x: 20 }
];
const overlapFixed = Array.from(context.snapCueEndToNextStart(cues, 3), (cue) => ({ ...cue }));
assert.deepEqual(overlapFixed, [
  { id: 8, start: 5, end: 7, text: "Next", x: 60 },
  { id: 3, start: 1, end: 5, text: "First", x: 20 }
], "chronological next start trims overlap while preserving array order and cue data");
assert.deepEqual(cues[1], { id: 3, start: 1, end: 6, text: "First", x: 20 }, "source cues are not mutated");
const gapClosed = context.snapCueEndToNextStart([
  { id: 1, start: 0, end: 2 },
  { id: 2, start: 4, end: 6 }
], 1);
assert.equal(gapClosed[0].end, 4, "a gap can be closed at the exact next start");
assert.equal(context.snapCueEndToNextStart(cues, 8), null, "last chronological cue is rejected");
assert.equal(context.snapCueEndToNextStart([{ id: 1, start: 2, end: 4 }, { id: 2, start: 2, end: 5 }], 1), null, "same-start next cue cannot create a zero-duration cue");
assert.equal(context.snapCueEndToNextStart(cues, 99), null, "unknown cue is rejected");

assert.match(script, /data-action="snap-end">End at next cue<\/button>/, "non-final list item exposes snap action");
assert.match(script, /const snapped = snapCueEndToNextStart\(editorCues, id\);/, "action invokes shipped helper");
assert.match(script, /editorCues = snapped;[\s\S]*?renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);\s*setEditorStatus\("Cue end aligned to the next cue start\."\);/, "successful snap refreshes list, preview, persistence, and status");
assert.match(script, /cueIndex < sortedCues\.length - 1/, "final chronological cue omits snap action");

console.log("cue end snap verification: pass");
