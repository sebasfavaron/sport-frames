#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("script.js", "utf8");
const start = script.indexOf("  function offsetCueTimings(");
const end = script.indexOf("\n\n  function findCueBodiesWithBlankLines", start);
assert.ok(start >= 0 && end > start, "offsetCueTimings source found");
const context = {};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\nthis.offsetCueTimings = offsetCueTimings;`, context);

const cues = [
  { id: 1, start: 1, end: 2.5, text: "first", x: 50, y: 8, size: 60 },
  { id: 2, start: 4, end: 5, text: "second", x: 20, y: 70, size: 30 }
];
const later = context.offsetCueTimings(cues, 0.75);
assert.deepEqual(JSON.parse(JSON.stringify(later)), [
  { ...cues[0], start: 1.75, end: 3.25 },
  { ...cues[1], start: 4.75, end: 5.75 }
], "positive offset shifts every boundary and preserves cue data");
assert.deepEqual(JSON.parse(JSON.stringify(context.offsetCueTimings(cues, -1))), [
  { ...cues[0], start: 0, end: 1.5 },
  { ...cues[1], start: 3, end: 4 }
], "negative offset may land exactly at zero");
assert.equal(context.offsetCueTimings(cues, -1.001), null, "offset cannot move a cue before zero");
assert.equal(context.offsetCueTimings(cues, NaN), null, "non-finite offset rejected");
assert.deepEqual(cues.map(({ start, end }) => ({ start, end })), [{ start: 1, end: 2.5 }, { start: 4, end: 5 }], "source cues are not mutated");

assert.match(script, /data-action="offset-all"/, "toolbar action exists");
assert.match(script, /editorCues = shifted;\s+renderEditorCues\(\);\s+updateVttAnnotation\(\);\s+saveEditorCues\(\);/, "successful shift refreshes list, preview, and persistence");
assert.match(script, /cannot move a cue before 0\.000s/, "invalid negative shift explains rejection");
console.log("cue timing offset verification: pass");
