#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function functionSource(name) {
  const start = script.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = script.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < script.length; i++) {
    if (script[i] === "{") depth++;
    if (script[i] === "}" && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

// setDestructiveUndoSnapshot is the single choke point every destructive/creation
// action calls immediately before mutating editorCues. Exercising it verbatim
// (with a mocked vttEditor) proves that arming a new undo snapshot always also
// invalidates any pending redo, which is what makes "new action clears redo"
// true without having to special-case every call site.
function makeButtonStub() {
  return { disabled: true };
}

function runSetSnapshot() {
  const undoButton = makeButtonStub();
  const redoButton = makeButtonStub();
  const buttons = {
    '[data-action="undo-destructive"]': undoButton,
    '[data-action="redo-destructive"]': redoButton
  };
  const context = {
    vttEditor: { querySelector: (selector) => buttons[selector] },
    destructiveUndoSnapshot: null,
    redoSnapshot: "pending-redo-before-new-action"
  };
  vm.createContext(context);
  vm.runInContext(
    `${functionSource("snapshotCues")}\n${functionSource("setDestructiveUndoSnapshot")}\nsetDestructiveUndoSnapshot([{ id: 1, start: 0, end: 1, text: "A" }]);`,
    context
  );
  return { context, undoButton, redoButton };
}

const { context: afterSet, undoButton, redoButton } = runSetSnapshot();
assert.deepEqual(JSON.parse(JSON.stringify(afterSet.destructiveUndoSnapshot)), [{ id: 1, start: 0, end: 1, text: "A" }], "arming undo stores a full snapshot of the pre-mutation cue list");
assert.equal(afterSet.redoSnapshot, null, "arming a new undo snapshot clears any pending redo, since the redo branch it belonged to no longer exists");
assert.equal(undoButton.disabled, false, "undo becomes available once a snapshot is armed");
assert.equal(redoButton.disabled, true, "redo is disabled again once a new destructive/creation action is taken");

// Snapshot independence: mutating the source array/cues after snapshotting must
// not retroactively corrupt what undo/redo will restore.
const sourceCues = [{ id: 5, start: 1, end: 2, text: "Goal", x: 10, y: 20, size: 30 }];
const { context: independence } = (() => {
  const undoButton = makeButtonStub();
  const redoButton = makeButtonStub();
  const buttons = {
    '[data-action="undo-destructive"]': undoButton,
    '[data-action="redo-destructive"]': redoButton
  };
  const context = { vttEditor: { querySelector: (selector) => buttons[selector] }, destructiveUndoSnapshot: null, redoSnapshot: null };
  vm.createContext(context);
  vm.runInContext(`${functionSource("snapshotCues")}\n${functionSource("setDestructiveUndoSnapshot")}\nsetDestructiveUndoSnapshot(cues);`, Object.assign(context, { cues: sourceCues }));
  return { context };
})();
sourceCues[0].text = "mutated after snapshot";
assert.equal(independence.destructiveUndoSnapshot[0].text, "Goal", "the armed snapshot is a deep-enough clone that later mutation of the live array does not corrupt it");

// Wiring: a discoverable, initially-disabled Redo control next to Undo.
assert.match(script, /data-action="undo-destructive" disabled>Undo last cue change<\/button>\s*<button type="button" data-action="redo-destructive" disabled>Redo<\/button>/, "redo control sits next to undo and starts disabled");

// Undo: captures the pre-restore state into redoSnapshot before restoring the
// older snapshot, remains one-shot, and re-enables the redo control.
assert.match(
  script,
  /if \(!destructiveUndoSnapshot\) return;\s*redoSnapshot = snapshotCues\(editorCues\);\s*editorCues = snapshotCues\(destructiveUndoSnapshot\);\s*destructiveUndoSnapshot = null;\s*event\.currentTarget\.disabled = true;\s*const redoButton = vttEditor\.querySelector\('\[data-action="redo-destructive"\]'\);\s*if \(redoButton\) redoButton\.disabled = false;/,
  "undo saves the current list as the redo target before restoring the older snapshot, then disables itself and enables redo"
);
assert.match(script, /setEditorStatus\("Last cue change undone\. Redo is available\."\);/, "undo status tells reviewers redo is now available");

// Redo: captures the pre-redo (i.e. post-undo) state back into destructiveUndoSnapshot
// before restoring redoSnapshot, remains one-shot, and re-enables undo.
assert.match(
  script,
  /if \(!redoSnapshot\) return;\s*const cuesToRestore = redoSnapshot;\s*destructiveUndoSnapshot = snapshotCues\(editorCues\);\s*const undoButton = vttEditor\.querySelector\('\[data-action="undo-destructive"\]'\);\s*if \(undoButton\) undoButton\.disabled = false;\s*editorCues = snapshotCues\(cuesToRestore\);\s*redoSnapshot = null;\s*event\.currentTarget\.disabled = true;/,
  "redo saves the pre-redo list back as the undo target before restoring the undone snapshot, then disables itself and re-enables undo"
);
assert.match(script, /renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);\s*setEditorStatus\("Redo applied\."\);\s*\}\);/, "redo refreshes the list, live preview, and persistence like every other mutation");

// Redo is transient UI/undo-history state, not a new cue field or export format.
assert.doesNotMatch(functionSource("buildVtt"), /redoSnapshot/, "redo does not affect WebVTT export");
assert.doesNotMatch(functionSource("buildSrt"), /redoSnapshot/, "redo does not affect SRT export");
assert.doesNotMatch(functionSource("saveEditorCues"), /redoSnapshot/, "redo state itself is never persisted to localStorage");

assert.doesNotMatch(script, /new (Worker|WebSocket)\(|fetch\(|XMLHttpRequest|require\(["']express["']\)/, "no backend/network dependency introduced");

console.log("T-049.50 redo for undone cue changes verification: pass");
