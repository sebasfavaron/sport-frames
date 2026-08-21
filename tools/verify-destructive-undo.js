const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("script.js", "utf8");
const start = script.indexOf("  function snapshotCues(cues) {");
const end = script.indexOf("\n\n  function setDestructiveUndoSnapshot", start);
assert.notEqual(start, -1, "snapshot helper exists");
assert.notEqual(end, -1, "snapshot helper boundary exists");
const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.snapshotCues = snapshotCues;`, context);

const before = [{ id: 3, start: 1.25, end: 2.5, text: "Goal", x: 23, y: 71, size: 42 }];
const deletionSnapshot = context.snapshotCues(before);
before[0].text = "mutated";
assert.deepEqual(JSON.parse(JSON.stringify(deletionSnapshot)), [{ id: 3, start: 1.25, end: 2.5, text: "Goal", x: 23, y: 71, size: 42 }], "snapshot preserves complete cue independently");
const restoredAfterDelete = context.snapshotCues(deletionSnapshot);
assert.deepEqual(JSON.parse(JSON.stringify(restoredAfterDelete)), JSON.parse(JSON.stringify(deletionSnapshot)), "delete snapshot restores exactly");
const restoredAfterClear = context.snapshotCues([{ id: 1, start: 0, end: 1, text: "A", x: 50, y: 8, size: 60 }, { id: 2, start: 2, end: 3, text: "B", x: 20, y: 30, size: 40 }]);
assert.equal(restoredAfterClear.length, 2, "clear-all snapshot restores every cue");

assert.match(script, /data-action="undo-destructive" disabled>Undo destructive action/, "generic undo starts disabled");
assert.match(script, /setDestructiveUndoSnapshot\(editorCues\);\n        editorCues = editorCues\.filter/, "delete snapshots before mutation");
assert.match(script, /setDestructiveUndoSnapshot\(editorCues\);\n      editorCues = \[\];/, "clear-all snapshots after confirmation and before mutation");
assert.match(script, /destructiveUndoSnapshot = null;\n      event\.currentTarget\.disabled = true;/, "undo is one-shot");
assert.match(script, /renderEditorCues\(\);\n      updateVttAnnotation\(\);\n      saveEditorCues\(\);\n      setEditorStatus\("Last destructive action undone\."\);/, "undo refreshes preview, persistence, and generic status");
console.log("destructive cue undo verification: pass");
