#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(
  script,
  /const merged = mergeCueWithNext\(editorCues, id\);[\s\S]*?if \(!merged\) \{[\s\S]*?return;[\s\S]*?\}\s*setDestructiveUndoSnapshot\(editorCues\);\s*if \(editingCueId === id/,
  "a valid merge snapshots the complete cue list immediately before mutation"
);
assert.match(
  script,
  /setDestructiveUndoSnapshot\(editorCues\);[\s\S]*?editorCues = merged;\s*renderEditorCues\(\);\s*updateVttAnnotation\(\);\s*saveEditorCues\(\);/,
  "merge mutates only after the undo snapshot and refreshes all editor state"
);
assert.match(
  script,
  /editorCues = snapshotCues\(destructiveUndoSnapshot\);\s*destructiveUndoSnapshot = null;\s*event\.currentTarget\.disabled = true;/,
  "undo restores the full pre-merge list and remains one-shot"
);
assert.match(script, /Undo destructive action/, "control describes its expanded merge/delete scope");
assert.match(script, /Last destructive action undone\./, "restoration status is action-neutral");

console.log("cue merge undo verification: pass");
