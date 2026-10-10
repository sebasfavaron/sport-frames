#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

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

// Extracts the body of a `vttEditor.querySelector('[data-action="X"]').addEventListener("click", ...)`
// listener by brace-depth matching, so assertions see exactly that handler and nothing past it.
function listenerSource(action) {
  const markerPattern = new RegExp(
    `vttEditor\\.querySelector\\('\\[data-action="${action}"\\]'\\)\\.addEventListener\\("click", \\((?:event)?\\) => \\{`
  );
  const found = script.match(markerPattern);
  assert.ok(found, `click listener for data-action="${action}" must exist in script.js`);
  const start = script.indexOf(found[0]);
  const brace = script.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < script.length; i++) {
    if (script[i] === "{") depth++;
    if (script[i] === "}" && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Could not extract listener for ${action}`);
}

const MACHINE_TEXT_PREFIXES = ["OCR: ", "SPEECH: "];
const context = { MACHINE_TEXT_PREFIXES };
vm.createContext(context);
vm.runInContext(
  `${functionSource("machineTextPrefix")}\n${functionSource("findUnreviewedMachineTextCues")}\n${functionSource("acceptMachineTextCue")}\n${functionSource("acceptAllMachineTextCues")}\n` +
    "this.findUnreviewedMachineTextCues = findUnreviewedMachineTextCues;\n" +
    "this.acceptAllMachineTextCues = acceptAllMachineTextCues;",
  context
);

// vm-context results are objects/arrays from another realm; JSON round-trip
// normalises them into ordinary objects in this realm so assert.deepEqual
// (which is deepStrictEqual and checks prototypes) can compare them.
const plain = (value) => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

const mixedCues = [
  { id: 1, start: 0, end: 1, text: "Kickoff", x: 50, y: 8, size: 60 },
  { id: 2, start: 1, end: 2, text: "OCR: HOME 2 AWAY 1", x: 50, y: 8, size: 60 },
  { id: 3, start: 2, end: 3, text: "TODO: review scene cut (score 0.312)", x: 50, y: 8, size: 60 },
  { id: 4, start: 3, end: 4, text: "SPEECH: goal from the left", x: 50, y: 8, size: 60 }
];
const before = plain(mixedCues);

const accepted = plain(context.acceptAllMachineTextCues(mixedCues));
assert.ok(accepted, "accept-all returns an updated cue list when something is flagged");

// Only the OCR/SPEECH-prefixed cues are stripped; plain and TODO: review bodies are untouched.
assert.deepEqual(accepted.find((cue) => cue.id === 1), before.find((cue) => cue.id === 1), "authored cue is unchanged");
assert.deepEqual(accepted.find((cue) => cue.id === 3), before.find((cue) => cue.id === 3), "T-049.58's TODO: review placeholder is untouched and not dismissed");
assert.deepEqual(
  accepted.find((cue) => cue.id === 2),
  { id: 2, start: 1, end: 2, text: "HOME 2 AWAY 1", x: 50, y: 8, size: 60 },
  "OCR prefix stripped, recognized text kept verbatim, other fields unchanged"
);
assert.deepEqual(
  accepted.find((cue) => cue.id === 4),
  { id: 4, start: 3, end: 4, text: "goal from the left", x: 50, y: 8, size: 60 },
  "SPEECH prefix stripped, recognized text kept verbatim, other fields unchanged"
);

// The unreviewed-machine-text count goes to 0 after accept-all.
assert.deepEqual([...context.findUnreviewedMachineTextCues(accepted)], [], "no cue is left flagged after accept-all");

// The source list passed in is not mutated.
assert.deepEqual(plain(mixedCues), before, "source cue list is not mutated by acceptAllMachineTextCues");

// No-op: nothing flagged.
assert.equal(
  context.acceptAllMachineTextCues([
    { id: 1, start: 0, end: 1, text: "Kickoff", x: 50, y: 8, size: 60 },
    { id: 3, start: 2, end: 3, text: "TODO: review scene cut (score 0.312)", x: 50, y: 8, size: 60 }
  ]),
  null,
  "accept-all on a list with no unreviewed machine text is a no-op (null)"
);
assert.equal(context.acceptAllMachineTextCues([]), null, "accept-all on an empty list is a no-op (null)");

// Toolbar action: rendered once, hidden/shown by the unreviewed machine-text count, not per-cue.
assert.match(
  script,
  /<button type="button" data-action="accept-all-machine-text" hidden>Accept all machine text<\/button>/,
  "toolbar action exists and starts hidden"
);
assert.match(
  script,
  /acceptAllMachineTextButton\.hidden = unreviewedMachineTextCues\.size === 0/,
  "toolbar action visibility follows the unreviewed machine-text count"
);

// Click handler: calls acceptAllMachineTextCues, takes exactly one undo snapshot through the
// shared choke point (not one per cue, or Undo would only restore the last cue touched), and
// refreshes list/preview/persistence like every other cue-mutating action.
const acceptAllListener = listenerSource("accept-all-machine-text");
assert.match(acceptAllListener, /const accepted = acceptAllMachineTextCues\(editorCues\);/, "handler calls acceptAllMachineTextCues");
assert.match(
  acceptAllListener,
  /setDestructiveUndoSnapshot\(editorCues\);[\s\S]*editorCues = accepted;/,
  "snapshot is taken before the cue list is replaced"
);
const snapshotCallsInHandler = acceptAllListener.match(/setDestructiveUndoSnapshot\(/g) || [];
assert.equal(snapshotCallsInHandler.length, 1, "exactly one undo snapshot is taken, so a single Undo restores every accepted cue");
assert.match(acceptAllListener, /renderEditorCues\(\);/, "handler re-renders the list");
assert.match(acceptAllListener, /updateVttAnnotation\(\);/, "handler refreshes the live preview");
assert.match(acceptAllListener, /saveEditorCues\(\);/, "handler persists the result");

// T-049.59's per-cue Accept text action and T-049.58's flag are untouched by this slice.
assert.match(script, /function acceptMachineTextCue\(cues, cueId\)/, "T-049.59's per-cue accept is untouched");
assert.match(script, /function findUnreviewedSuggestionCues\(cues\)/, "T-049.58's suggester-placeholder check is untouched");
assert.doesNotMatch(script, /dismiss.*(suggestion|placeholder)/i, "no dismiss action was added for T-049.58 placeholders (left to Sebas)");

// Advisory only: no export or persistence change beyond the cue text itself.
assert.doesNotMatch(functionSource("buildVtt"), /acceptAllMachineTextCues|unreviewedMachineText/i, "accept-all does not affect WebVTT export");
assert.doesNotMatch(functionSource("saveEditorCues"), /acceptAllMachineTextCues|unreviewedMachineText/i, "accept-all adds no new persisted field");

console.log("T-049.60 accept-all machine-text verification: pass");
