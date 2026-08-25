#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function cueEditNavigationDirection(event, form) {");
const end = script.indexOf("\n  function setEditorStatus", start);
assert.notEqual(start, -1, "cueEditNavigationDirection exists");
assert.notEqual(end, -1, "navigation helper extraction boundary exists");

const context = {};
vm.runInNewContext(
  `${script.slice(start, end)}\nthis.cueEditNavigationDirection = cueEditNavigationDirection;\nthis.adjacentCueInDirection = adjacentCueInDirection;`,
  context
);

const inside = {};
const outside = {};
const form = { contains: (target) => target === inside };
const event = (overrides = {}) => ({
  key: "ArrowDown",
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  target: inside,
  ...overrides
});

assert.equal(context.cueEditNavigationDirection(event(), form), "next", "Alt+ArrowDown inside the form navigates to the next cue");
assert.equal(context.cueEditNavigationDirection(event({ key: "ArrowUp" }), form), "prev", "Alt+ArrowUp inside the form navigates to the previous cue");
assert.equal(context.cueEditNavigationDirection(event({ target: outside }), form), null, "shortcut outside the form is ignored");
assert.equal(context.cueEditNavigationDirection(event({ altKey: false }), form), null, "plain arrow key is ignored so number-input spinners and text navigation are unaffected");
assert.equal(context.cueEditNavigationDirection(event({ ctrlKey: true }), form), null, "Ctrl-modified combination is ignored");
assert.equal(context.cueEditNavigationDirection(event({ metaKey: true }), form), null, "Cmd-modified combination is ignored");
assert.equal(context.cueEditNavigationDirection(event({ shiftKey: true }), form), null, "Shift-modified combination is ignored");
assert.equal(context.cueEditNavigationDirection(event({ key: "ArrowLeft" }), form), null, "unrelated key values are ignored");
assert.equal(context.cueEditNavigationDirection(event({ repeat: true }), form), null, "key repeat is ignored");

const cues = [
  { id: 3, start: 5, end: 6, text: "Second", x: 50, y: 8, size: 60 },
  { id: 1, start: 0, end: 1, text: "First", x: 50, y: 8, size: 60 },
  { id: 2, start: 2, end: 3, text: "Middle", x: 50, y: 8, size: 60 }
];
const normalize = (result) => (result ? { ...result } : result);
assert.deepEqual(
  normalize(context.adjacentCueInDirection(cues, 1, "next")),
  { cue: cues[2], position: 2, total: 3 },
  "next from the chronologically first cue returns the middle cue with its 1-based position"
);
assert.deepEqual(
  normalize(context.adjacentCueInDirection(cues, 2, "prev")),
  { cue: cues[1], position: 1, total: 3 },
  "prev from the middle cue returns the chronologically first cue"
);
assert.equal(context.adjacentCueInDirection(cues, 3, "next"), null, "no next cue past the chronologically last cue");
assert.equal(context.adjacentCueInDirection(cues, 1, "prev"), null, "no prev cue before the chronologically first cue");
assert.equal(context.adjacentCueInDirection(cues, 99, "next"), null, "unknown cue id is rejected");
assert.equal(context.adjacentCueInDirection([cues[0]], 3, "next"), null, "a single cue has no adjacent cue in either direction");

assert.match(script, /<kbd>Alt<\/kbd>\+<kbd>↓<\/kbd>\/<kbd>↑<\/kbd> next\/prev cue<\/span>/, "visible shortcut map documents the navigation shortcut");
assert.match(script, /function startEditingCue\(cue\) \{/, "shared edit-loading helper exists");
assert.match(script, /const direction = cueEditNavigationDirection\(event, form\);/, "form keydown listener checks the navigation shortcut");
assert.match(
  script,
  /const adjacent = adjacentCueInDirection\(editorCues, editingCueId, direction\);[\s\S]*?startEditingCue\(adjacent\.cue\);/,
  "navigation shortcut loads the adjacent cue into the shared edit helper"
);
assert.match(script, /startEditingCue\(cue\);\s*\}\);/, "list Edit action reuses the shared edit helper");

console.log("cue navigation verification: pass");
