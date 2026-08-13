#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function splitCueAtTime(cue, time, newId) {");
const end = script.indexOf("\n  function offsetCueTimings", start);
assert.notEqual(start, -1, "splitCueAtTime exists");
assert.notEqual(end, -1, "splitCueAtTime extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.splitCueAtTime = splitCueAtTime;`, context);
const cue = { id: 4, start: 2, end: 8, text: "Goal", x: 25, y: 70, size: 40 };
const split = Array.from(context.splitCueAtTime(cue, 5, 9), (item) => ({ ...item }));
assert.deepEqual(split, [
  { id: 4, start: 2, end: 5, text: "Goal", x: 25, y: 70, size: 40 },
  { id: 9, start: 5, end: 8, text: "Goal", x: 25, y: 70, size: 40 }
], "split preserves coverage, text, spatial values, and original id while assigning a fresh second id");
assert.deepEqual(cue, { id: 4, start: 2, end: 8, text: "Goal", x: 25, y: 70, size: 40 }, "source cue is not mutated");
assert.equal(context.splitCueAtTime(cue, 2, 10), null, "start boundary is rejected");
assert.equal(context.splitCueAtTime(cue, 8, 10), null, "end boundary is rejected");
assert.equal(context.splitCueAtTime(cue, 1, 10), null, "time before cue is rejected");
assert.equal(context.splitCueAtTime(cue, Number.NaN, 10), null, "non-finite time is rejected");

assert.match(script, /data-action="split">Split at scrub time<\/button>/, "list item exposes split action");
assert.match(script, /const time = currentScrubTime\(\);\s*\n\s*const split = splitCueAtTime\(cue, time, nextCueId\);/, "action uses live scrub time");
assert.match(script, /editorCues\.splice\(editorCues\.indexOf\(cue\), 1, \.\.\.split\);\s*\n\s*renderEditorCues\(\);\s*\n\s*updateVttAnnotation\(\);\s*\n\s*saveEditorCues\(\);/, "successful split replaces cue, re-renders, refreshes preview, and persists");
assert.match(script, /Scrub time must be strictly inside this cue to split it/, "invalid split reports actionable status");

console.log("cue split verification: pass");
