#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${functionSource("pruneSelectedCueIds")}\n${functionSource("deleteCuesByIds")}\nthis.api={pruneSelectedCueIds,deleteCuesByIds};`,
  context
);

const cue = (id, start, end, text) => ({ id, start, end, text });
const cues = [cue(1, 0, 2, "Kickoff"), cue(2, 3, 5, "Corner"), cue(3, 6, 8, "Foul")];

// pruneSelectedCueIds: drops ids no longer present (e.g. after an unrelated delete/merge)
// and keeps ids that still exist, without mutating the input set.
const staleSelection = new Set([1, 3, 99]);
const pruned = context.api.pruneSelectedCueIds(staleSelection, cues);
assert.deepEqual([...pruned].sort(), [1, 3], "prune drops ids not present in the current cue list");
assert.deepEqual([...staleSelection].sort((a, b) => a - b), [1, 3, 99], "prune does not mutate the source set");

const emptySelection = context.api.pruneSelectedCueIds(new Set(), cues);
assert.equal(emptySelection.size, 0, "pruning an empty selection stays empty");

const allStale = context.api.pruneSelectedCueIds(new Set([50, 60]), cues);
assert.equal(allStale.size, 0, "pruning a selection with no surviving ids returns empty");

// deleteCuesByIds: removes exactly the selected ids, preserves order of survivors,
// and does not mutate the source array (mirrors the delete/duplicate/merge helpers).
const afterDelete = context.api.deleteCuesByIds(cues, new Set([2]));
assert.deepEqual(afterDelete.map((c) => c.id), [1, 3], "deletes only the targeted cue");
assert.deepEqual(cues.map((c) => c.id), [1, 2, 3], "does not mutate the source array");

const afterBulkDelete = context.api.deleteCuesByIds(cues, new Set([1, 3]));
assert.deepEqual(afterBulkDelete.map((c) => c.id), [2], "deletes every id in a multi-id selection");

const afterNoopDelete = context.api.deleteCuesByIds(cues, new Set([999]));
assert.deepEqual(afterNoopDelete.map((c) => c.id), [1, 2, 3], "deleting an unknown id changes nothing");

const afterFullDelete = context.api.deleteCuesByIds(cues, new Set([1, 2, 3]));
assert.deepEqual(afterFullDelete, [], "deleting every id empties the list");

// Wiring: per-cue selection checkbox, toolbar controls, and delegated handlers exist.
assert.match(source, /selectCheckbox\.dataset\.action = "select-cue"/, "each cue row gets a select checkbox");
assert.match(source, /selectCheckbox\.checked = selectedCueIds\.has\(cue\.id\)/, "checkbox reflects current selection state");
assert.match(source, /item\.append\(selectCheckbox, summary, timeline, actions\)/, "select checkbox renders as part of the cue row");
assert.match(source, /data-action="select-all-visible"/, '"select all visible" control exists');
assert.match(source, /data-action="delete-selected"/, '"delete selected" control exists');

assert.match(functionSource("renderEditorCues"), /selectedCueIds = pruneSelectedCueIds\(selectedCueIds, editorCues\)/, "render prunes stale selection before drawing the list");
assert.match(functionSource("renderEditorCues"), /selectAllVisible\.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCues\.length/, "select-all checkbox shows indeterminate state for a partial selection");
assert.match(functionSource("renderEditorCues"), /deleteSelected\.textContent = `Delete selected \(\$\{selectedCueIds\.size\}\)`/, "delete-selected button reports the live selection count");

assert.match(source, /vttEditor\.querySelector\(".vtt-editor__list"\)\.addEventListener\("change"/, "cue list has a delegated change handler for checkboxes");
assert.match(source, /vttEditor\.querySelector\('\[data-action="select-all-visible"\]'\)\.addEventListener\("change"/, "select-all-visible control is wired up");

const deleteSelectedHandlerStart = source.indexOf('vttEditor.querySelector(\'[data-action="delete-selected"]\').addEventListener("click"');
assert.notEqual(deleteSelectedHandlerStart, -1, "delete-selected click handler exists");
const deleteSelectedHandler = source.slice(deleteSelectedHandlerStart, deleteSelectedHandlerStart + 700);
assert.match(deleteSelectedHandler, /window\.confirm\(`Delete \$\{count\} selected cue\(s\)\?`\)/, "bulk delete confirms before destroying cues, like clear-all");
assert.match(deleteSelectedHandler, /setDestructiveUndoSnapshot\(editorCues\)/, "bulk delete captures an undo snapshot before mutating");
assert.match(deleteSelectedHandler, /deleteCuesByIds\(editorCues, idsToDelete\)/, "bulk delete uses the shared pure helper");
assert.match(deleteSelectedHandler, /if \(editingCueId !== null && idsToDelete\.has\(editingCueId\)\) resetEditorForm\(\)/, "bulk delete resets the form if the cue being edited is removed");
assert.match(deleteSelectedHandler, /selectedCueIds\.clear\(\)/, "bulk delete clears the selection afterward");
assert.match(deleteSelectedHandler, /saveEditorCues\(\)/, "bulk delete persists the resulting cue list");

// Selection is ephemeral UI state only: never written to storage or the exported files.
assert.doesNotMatch(functionSource("saveEditorCues"), /selectedCueIds/, "selection state is not persisted to localStorage");
assert.doesNotMatch(functionSource("buildVtt"), /selectedCueIds/, "selection state does not affect WebVTT export");
assert.doesNotMatch(functionSource("buildSrt"), /selectedCueIds/, "selection state does not affect SRT export");

assert.match(css, /\.vtt-editor__list li > input\[type="checkbox"\] \{/, "select checkboxes have dedicated spacing styling");
assert.doesNotMatch(source, /new (Worker|WebSocket)\(|fetch\(|XMLHttpRequest|require\(["']express["']\)/, "no backend/network dependency introduced");

console.log("T-049.48 bulk cue select/delete verification: pass");
