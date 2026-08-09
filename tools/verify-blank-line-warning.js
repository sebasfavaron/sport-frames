#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("script.js", "utf8");
const start = script.indexOf("  function findCueBodiesWithBlankLines(");
const end = script.indexOf("\n  function currentScrubTime(", start);
assert.notEqual(start, -1, "findCueBodiesWithBlankLines exists");
assert.notEqual(end, -1, "detector extraction boundary exists");

const context = { Set };
vm.runInNewContext(`${script.slice(start, end)}\nthis.findCueBodiesWithBlankLines = findCueBodiesWithBlankLines;`, context);
const result = (text) => [...context.findCueBodiesWithBlankLines([{ id: 7, text }])];

assert.deepEqual(result("One line"), [], "single-line cue is safe");
assert.deepEqual(result("First line\nSecond line"), [], "adjacent multiline text is valid WebVTT cue text");
assert.deepEqual(result("First line\n\nSecond paragraph"), [7], "LF blank line is detected");
assert.deepEqual(result("First line\r\n \t\r\nSecond paragraph"), [7], "whitespace-only CRLF blank line is detected");
assert.deepEqual(result("First line\n  Second line"), [], "indented adjacent line is not blank");
assert.deepEqual(result(undefined), [], "missing text is left to empty-body validation");
assert.deepEqual(
  [...context.findCueBodiesWithBlankLines([
    { id: 1, text: "safe" },
    { id: 2, text: "unsafe\n\ntext" },
    { id: 3, text: "also\n \nunsafe" }
  ])].sort(),
  [2, 3],
  "mixed cues return only affected ids"
);

assert.match(script, /Blank line splits WebVTT cue/, "per-cue warning label is rendered");
assert.match(script, /class="vtt-editor__blank-line-warning" role="status" hidden/, "aggregate warning is accessible");
assert.match(script, /const cueBodiesWithBlankLines = findCueBodiesWithBlankLines\(editorCues\)/, "render path computes warning");
assert.match(script, /blank line that terminates a WebVTT cue/, "aggregate warning explains standards consequence");

console.log("blank-line warning verification: pass");
