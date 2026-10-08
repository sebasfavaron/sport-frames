#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

// The machine-text prefix is owned by the two emitters that produce real cue
// text rather than a "TODO: review ..." placeholder. Read what they actually
// print so a rename there fails this check instead of silently un-flagging
// cues, instead of assuming the prefix here.
const ocrScript = fs.readFileSync(path.join(root, "tools", "suggest-ocr-vtt.sh"), "utf8");
const speechScript = fs.readFileSync(path.join(root, "tools", "suggest-speech-vtt.sh"), "utf8");

const ocrMatch = ocrScript.match(/echo "([A-Za-z]+: )\$text"/);
assert.ok(ocrMatch, "suggest-ocr-vtt.sh must emit a literal '<PREFIX>: ' cue body before $text");
const ocrPrefix = ocrMatch[1];

const speechMatch = speechScript.match(/print "([A-Za-z]+: )" text/);
assert.ok(speechMatch, "suggest-speech-vtt.sh must emit a literal '<PREFIX>: ' cue body before text");
const speechPrefix = speechMatch[1];

// script.js must flag exactly the prefixes the emitters actually print, not a
// hardcoded guess.
const shippedPrefixesMatch = script.match(/const MACHINE_TEXT_PREFIXES = (\[[^\]]*\]);/);
assert.ok(shippedPrefixesMatch, "script.js must define MACHINE_TEXT_PREFIXES");
const shippedPrefixes = JSON.parse(shippedPrefixesMatch[1]);
assert.deepEqual(
  [...shippedPrefixes].sort(),
  [ocrPrefix, speechPrefix].sort(),
  "script.js flags exactly the prefixes the OCR and speech emitters print"
);

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

const context = { MACHINE_TEXT_PREFIXES: shippedPrefixes };
vm.createContext(context);
vm.runInContext(
  `${functionSource("machineTextPrefix")}\n${functionSource("findUnreviewedMachineTextCues")}\n${functionSource("acceptMachineTextCue")}\n` +
    "this.machineTextPrefix = machineTextPrefix;\n" +
    "this.findUnreviewedMachineTextCues = findUnreviewedMachineTextCues;\n" +
    "this.acceptMachineTextCue = acceptMachineTextCue;",
  context
);

const flagged = (text) => [...context.findUnreviewedMachineTextCues([{ id: 7, text }])];

// Both machine-text shapes are flagged.
assert.deepEqual(flagged(`${ocrPrefix}2-1`), [7], "OCR-prefixed body is flagged");
assert.deepEqual(flagged(`${speechPrefix}goal from the left`), [7], "SPEECH-prefixed body is flagged");
assert.deepEqual(flagged(`  ${speechPrefix}goal from the left \n`), [7], "surrounding whitespace is ignored");

// What must NOT be flagged by this check: the separate T-049.58 placeholder,
// authored text, and malformed/missing bodies.
assert.deepEqual(flagged("TODO: review scene cut (score 0.312)"), [], "T-049.58's suggester placeholder is a different check");
assert.deepEqual(flagged("Goal"), [], "authored text is not flagged");
assert.deepEqual(flagged(`Please ${ocrPrefix}2-1`), [], "prefix must start the body");
assert.deepEqual(flagged(""), [], "empty body is left to the empty-body check");
assert.deepEqual(flagged(undefined), [], "missing text is not flagged");

assert.deepEqual(
  [...context.findUnreviewedMachineTextCues([
    { id: 1, text: "Kickoff" },
    { id: 2, text: `${ocrPrefix}2-1` },
    { id: 3, text: "TODO: review black-video interval" },
    { id: 4, text: `${speechPrefix}offside call` }
  ])].sort((a, b) => a - b),
  [2, 4],
  "mixed cues return only machine-text ids"
);

// acceptMachineTextCue: strips exactly the matched prefix, keeps the
// recognized text verbatim, and leaves every other field untouched.
const ocrCue = { id: 2, start: 1, end: 2, text: `${ocrPrefix}HOME 2 AWAY 1`, x: 50, y: 8, size: 60 };
const speechCue = { id: 4, start: 5, end: 6, text: `${speechPrefix}goal from the left`, x: 50, y: 8, size: 60 };
const authoredCue = { id: 1, start: 0, end: 1, text: "Kickoff", x: 50, y: 8, size: 60 };

// vm-context results are objects/arrays from another realm; JSON round-trip
// normalises them into ordinary objects in this realm so assert.deepEqual
// (which is deepStrictEqual and checks prototypes) can compare them.
const plain = (value) => value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));

const afterOcrAccept = plain(context.acceptMachineTextCue([ocrCue, speechCue, authoredCue], 2));
assert.ok(afterOcrAccept, "accepting an OCR cue returns an updated cue list");
assert.deepEqual(
  afterOcrAccept.find((cue) => cue.id === 2),
  { id: 2, start: 1, end: 2, text: "HOME 2 AWAY 1", x: 50, y: 8, size: 60 },
  "OCR prefix is stripped, recognized text kept verbatim, all other fields unchanged"
);
assert.deepEqual(afterOcrAccept.find((cue) => cue.id === 4), plain(speechCue), "a cue not being accepted is untouched");
assert.deepEqual(ocrCue.text, `${ocrPrefix}HOME 2 AWAY 1`, "the source cue object is not mutated");

const afterSpeechAccept = plain(context.acceptMachineTextCue([ocrCue, speechCue, authoredCue], 4));
assert.equal(afterSpeechAccept.find((cue) => cue.id === 4).text, "goal from the left", "SPEECH prefix is stripped and text kept verbatim");

assert.equal(context.acceptMachineTextCue([ocrCue, authoredCue], 1), null, "accepting a cue with no machine-text prefix is a no-op (null)");
assert.equal(context.acceptMachineTextCue([ocrCue], 999), null, "accepting an unknown cue id is a no-op (null)");

// Rendering: per-cue marker, toolbar count, validation summary entry, accept
// action, and styling.
assert.match(script, /const unreviewedMachineTextCues = findUnreviewedMachineTextCues\(editorCues\)/, "render path computes the machine-text set");
assert.match(script, /item\.classList\.add\("has-unreviewed-machine-text"\)/, "affected list items are marked");
assert.match(script, /Unreviewed machine text/, "per-cue label is rendered");
assert.match(script, /class="vtt-editor__unreviewed-machine-text-warning" role="status" hidden/, "toolbar warning is accessible");
assert.match(script, /unreviewedMachineTextWarning\.hidden = unreviewedMachineTextCues\.size === 0/, "toolbar warning follows the count");
assert.match(script, /still have unreviewed machine text/, "toolbar warning reports the count");
assert.match(script, /\[findUnreviewedMachineTextCues\(cues\), "Unreviewed machine text"\]/, "validation summary includes the check");
assert.match(css, /\.vtt-editor__list li\.has-unreviewed-machine-text,/, "list item is styled");
assert.match(css, /\.vtt-editor__unreviewed-machine-text-label,/, "per-cue label is styled");
assert.match(css, /\.vtt-editor__unreviewed-machine-text-warning,/, "toolbar warning is styled");

// Accept action: rendered only for flagged cues, wired through the same
// destructive-undo choke point every other cue-mutating action uses.
assert.match(
  script,
  /const acceptTextAction = unreviewedMachineTextCues\.has\(cue\.id\)\s*\n\s*\? `<button type="button" data-action="accept-text">Accept text<\/button>`/,
  "Accept text action is rendered only for flagged cues"
);
assert.match(
  script,
  /if \(button\.dataset\.action === "accept-text"\) \{\s*const accepted = acceptMachineTextCue\(editorCues, id\);/,
  "accept-text click handler calls acceptMachineTextCue"
);
assert.match(
  script,
  /if \(button\.dataset\.action === "accept-text"\) \{[\s\S]{0,400}setDestructiveUndoSnapshot\(editorCues\);[\s\S]{0,200}editorCues = accepted;/,
  "accept-text snapshots the current list (undo target) before mutating, same as delete/duplicate/merge-next"
);
assert.match(
  script,
  /if \(button\.dataset\.action === "accept-text"\) \{[\s\S]{0,600}renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);/,
  "accept-text refreshes list, live preview, and persistence like other mutations"
);

// T-049.58's placeholder flag and the lack of a dismiss action are unchanged
// by this slice.
assert.match(script, /function findUnreviewedSuggestionCues\(cues\)/, "T-049.58's suggester-placeholder check is untouched");
assert.doesNotMatch(script, /dismiss.*(suggestion|placeholder)/i, "no dismiss action was added for T-049.58 placeholders (left to Sebas)");

// Advisory only: no export or persistence change.
assert.doesNotMatch(functionSource("buildVtt"), /unreviewedMachineText|machineTextPrefix/i, "machine-text flag/accept state does not affect WebVTT export");
assert.doesNotMatch(functionSource("saveEditorCues"), /unreviewedMachineText/i, "machine-text flag is not itself persisted (only the resulting cue text is)");

console.log("T-049.59 unreviewed machine-text review flag + accept verification: pass");
