#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function snapCueStartToPreviousEnd(cues, cueId) {");
const end = script.indexOf("\n  function mergeCueWithNext", start);
assert.notEqual(start, -1, "snapCueStartToPreviousEnd exists");
assert.notEqual(end, -1, "snap helper extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.snapCueStartToPreviousEnd = snapCueStartToPreviousEnd;`, context);
const cues = [
  { id: 8, start: 5, end: 9, text: "Second", x: 60 },
  { id: 3, start: 1, end: 6, text: "First", x: 20 }
];
const overlapFixed = Array.from(context.snapCueStartToPreviousEnd(cues, 8), (cue) => ({ ...cue }));
assert.deepEqual(overlapFixed, [
  { id: 8, start: 6, end: 9, text: "Second", x: 60 },
  { id: 3, start: 1, end: 6, text: "First", x: 20 }
], "previous end trims overlap while preserving array order and cue data");
assert.deepEqual(cues[0], { id: 8, start: 5, end: 9, text: "Second", x: 60 }, "source cues are not mutated");
const gapClosed = context.snapCueStartToPreviousEnd([
  { id: 1, start: 0, end: 2 },
  { id: 2, start: 4, end: 6 }
], 2);
assert.equal(gapClosed[1].start, 2, "a gap can be closed at the exact previous end");
assert.equal(context.snapCueStartToPreviousEnd(cues, 3), null, "first chronological cue is rejected");
assert.equal(context.snapCueStartToPreviousEnd([{ id: 1, start: 0, end: 5 }, { id: 2, start: 2, end: 5 }], 2), null, "previous end cannot create a zero-duration cue");
assert.equal(context.snapCueStartToPreviousEnd(cues, 99), null, "unknown cue is rejected");

assert.match(script, /data-action="snap-start">Start at previous cue end<\/button>/, "non-first list item exposes snap action");
assert.match(script, /const snapped = snapCueStartToPreviousEnd\(editorCues, id\);/, "action invokes shipped helper");
assert.match(script, /editorCues = snapped;[\s\S]*?renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);\s*setEditorStatus\("Cue start aligned to the previous cue end\."\);/, "successful snap refreshes list, preview, persistence, and status");
assert.match(script, /cueIndex > 0/, "first chronological cue omits snap action");

console.log("cue start snap verification: pass");
