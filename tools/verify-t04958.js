#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

// The placeholder prefix is owned by the suggesters. Read what they print so a
// rename there fails this check instead of silently un-flagging cues.
const placeholderEmitters = ["scenecut", "black", "freeze", "silence", "loudpeak"];
for (const name of placeholderEmitters) {
  const emitter = fs.readFileSync(path.join(root, "tools", `suggest-${name}-vtt.sh`), "utf8");
  assert.ok(emitter.includes("TODO: review "), `suggest-${name}-vtt.sh still emits the TODO: review placeholder`);
}

function functionSource(name) {
  const start = script.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in script.js`);
  const brace = script.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < script.length; i++) {
    if (script[i] === "{") depth++;
    if (script[i] === "}" && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${functionSource("findUnreviewedSuggestionCues")}\n${functionSource("findEmptyCueBodies")}\n` +
    "this.findUnreviewedSuggestionCues = findUnreviewedSuggestionCues;\nthis.findEmptyCueBodies = findEmptyCueBodies;",
  context
);
const flagged = (text) => [...context.findUnreviewedSuggestionCues([{ id: 3, text }])];

// Every suggester placeholder shape is flagged.
assert.deepEqual(flagged("TODO: review scene cut (score 0.312)"), [3], "scene-cut placeholder is flagged");
assert.deepEqual(flagged("TODO: review black-video interval"), [3], "black-video placeholder is flagged");
assert.deepEqual(flagged("TODO: review frozen-video interval"), [3], "freeze placeholder is flagged");
assert.deepEqual(flagged("TODO: review quiet interval"), [3], "silence placeholder is flagged");
assert.deepEqual(flagged("TODO: review loud/crowd-reaction interval"), [3], "loudpeak placeholder is flagged");
assert.deepEqual(flagged("  TODO: review quiet interval \n"), [3], "surrounding whitespace is ignored");

// Machine-read text and authored text are not placeholders.
assert.deepEqual(flagged("OCR: 2-1"), [], "OCR text is not a placeholder");
assert.deepEqual(flagged("SPEECH: goal from the left"), [], "speech text is not a placeholder");
assert.deepEqual(flagged("Goal"), [], "authored text is not flagged");
assert.deepEqual(flagged("TODO: annotation"), [], "editor's own TODO annotation is not a suggester placeholder");
assert.deepEqual(flagged("Please TODO: review later"), [], "prefix must start the body");
assert.deepEqual(flagged(""), [], "empty body is left to the empty-body check");
assert.deepEqual(flagged(undefined), [], "missing text is not a placeholder");

// The T-049.57 decision still holds: placeholders are not "empty text".
assert.deepEqual(
  [...context.findEmptyCueBodies([{ id: 3, text: "TODO: review scene cut (score 0.312)" }])],
  [],
  "placeholder bodies are not reclassified as empty text"
);

assert.deepEqual(
  [...context.findUnreviewedSuggestionCues([
    { id: 1, text: "Kickoff" },
    { id: 2, text: "TODO: review black-video interval" },
    { id: 3, text: "OCR: 2-1" },
    { id: 4, text: "TODO: review quiet interval" }
  ])].sort((a, b) => a - b),
  [2, 4],
  "mixed cues return only placeholder ids"
);

// Rendering: per-cue marker, toolbar count, validation summary entry, and styling.
assert.match(script, /const unreviewedSuggestionCues = findUnreviewedSuggestionCues\(editorCues\)/, "render path computes the set");
assert.match(script, /item\.classList\.add\("has-unreviewed-suggestion"\)/, "affected list items are marked");
assert.match(script, /Unreviewed suggester placeholder/, "per-cue label is rendered");
assert.match(script, /class="vtt-editor__unreviewed-suggestion-warning" role="status" hidden/, "toolbar warning is accessible");
assert.match(script, /unreviewedSuggestionWarning\.hidden = unreviewedSuggestionCues\.size === 0/, "toolbar warning follows the count");
assert.match(script, /still have unreviewed suggester placeholders/, "toolbar warning reports the count");
assert.match(script, /\[findUnreviewedSuggestionCues\(cues\), "Unreviewed suggester placeholder"\]/, "validation summary includes the check");
assert.match(css, /\.vtt-editor__list li\.has-unreviewed-suggestion,/, "list item is styled");
assert.match(css, /\.vtt-editor__unreviewed-suggestion-label,/, "per-cue label is styled");
assert.match(css, /\.vtt-editor__unreviewed-suggestion-warning,/, "toolbar warning is styled");

console.log("unreviewed suggester placeholder verification: pass");
