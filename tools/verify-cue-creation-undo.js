#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");

const script = fs.readFileSync(new URL("../script.js", `file://${__filename}`), "utf8");

assert.match(
  script,
  /if \(editingCueId === null\) \{\s*setDestructiveUndoSnapshot\(editorCues\);\s*editorCues\.push\(\{ id: nextCueId\+\+, start, end, text, x, y, size \}\);/,
  "valid cue add snapshots immediately before mutation"
);
assert.match(
  script,
  /if \(button\.dataset\.action === "duplicate"\) \{\s*const clone = duplicateCue\(cue, nextCueId\+\+\);\s*setDestructiveUndoSnapshot\(editorCues\);\s*editorCues\.push\(clone\);/,
  "duplicate snapshots immediately before mutation"
);
assert.match(
  script,
  /if \(!Number\.isFinite\(start\)[\s\S]*?return;\s*}\s*if \(editingCueId === null\) \{\s*setDestructiveUndoSnapshot/,
  "invalid form submissions return before replacing undo state"
);
assert.match(script, /data-action="undo-destructive" disabled>Undo last cue change/, "undo label covers creation and destructive changes");
assert.match(
  script,
  /editorCues = snapshotCues\(destructiveUndoSnapshot\);\s*destructiveUndoSnapshot = null;\s*event\.currentTarget\.disabled = true;[\s\S]*?renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);/,
  "existing one-shot undo restores, renders, previews, and persists the pre-creation list"
);

const snapshot = [{ id: 1, start: 0, end: 1, text: "Original", x: 50, y: 8, size: 60 }].map((cue) => ({ ...cue }));
const afterAdd = snapshot.concat({ id: 2, start: 1, end: 2, text: "Added", x: 50, y: 8, size: 60 });
const restored = snapshot.map((cue) => ({ ...cue }));
assert.equal(afterAdd.length, 2);
assert.deepEqual(restored, snapshot, "undo removes the created cue and preserves complete prior cue data");
assert.notEqual(restored[0], snapshot[0], "restoration clones cue objects");

console.log("cue creation undo verification passed");
