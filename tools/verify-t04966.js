#!/usr/bin/env node
"use strict";

// T-049.66 - one-click adopt the recognized OCR/speech text that
// suggest-all-vtt.sh's merge step (T-049.63) appends to a kept TODO: review
// placeholder cue when a dropped ocr/speech suggestion lands on the same
// moment. T-049.63 made that text survive the merge as
// "[also flagged by: ocr: TEXT]" inside the kept cue's body, but nothing in
// the editor did anything with it: the human still had to read the bracket
// and retype/copy TEXT into the cue body by hand, deleting the TODO
// placeholder and the bracket themselves. This verifier extracts the shipped
// findMergedRecognizedTextCues/acceptMergedRecognizedText verbatim, proves
// their behavior, proves the editor is wired to them, and proves
// falsifiability against a /tmp copy of the pre-change script.js.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const vm = require("node:vm");

const repoRoot = path.join(__dirname, "..");
const scriptPath = path.join(repoRoot, "script.js");
const source = fs.readFileSync(scriptPath, "utf8");
const css = fs.readFileSync(path.join(repoRoot, "style.css"), "utf8");

function functionSource(src, name) {
  const start = src.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function buildApi(src) {
  const context = {
    MERGED_RECOGNIZED_TEXT_PATTERN: /\[also flagged by: (?:ocr|speech): [^\]]*\]/,
    MERGED_RECOGNIZED_TEXT_EXTRACT_PATTERN: /\[also flagged by: (?:ocr|speech): ([^\]]*)\]/g
  };
  vm.createContext(context);
  vm.runInContext(
    `${functionSource(src, "findMergedRecognizedTextCues")}\n${functionSource(src, "acceptMergedRecognizedText")}\n` +
      "this.api={findMergedRecognizedTextCues,acceptMergedRecognizedText};",
    context
  );
  return context.api;
}

const cue = (id, text) => ({ id, text });

// --- 1. findMergedRecognizedTextCues flags exactly the merged-dup shape ---
const api = buildApi(source);

const mergedOcr = "TODO: review scene cut (score 0.448) [also flagged by: ocr: HOME 2 AWAY]";
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, mergedOcr)])], [1], "merged OCR text on a TODO placeholder is flagged");

const mergedSpeech = "TODO: review loud peak (score 0.9) [also flagged by: speech: goal from the left]";
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, mergedSpeech)])], [1], "merged speech text on a TODO placeholder is flagged");

// What must NOT be flagged: a plain OCR/SPEECH-prefixed cue (T-049.59's own
// case; already has a working "Accept text" action), a bare TODO placeholder
// with no recognized text attached (T-049.58's case), a TODO placeholder
// merged with a non-text suggester only, authored text, and missing/empty text.
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, "OCR: HOME 2 AWAY")])], [], "a plain OCR-prefixed cue is a different, already-handled case");
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, "TODO: review scene cut (score 0.3)")])], [], "a bare suggester placeholder with no recognized text is not flagged");
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, "TODO: review black-video interval [also flagged by: freeze]")])], [], "a TODO cue merged only with a non-text suggester is not flagged");
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, "Goal")])], [], "authored text is never flagged");
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, "")])], [], "empty body is left to the empty-body check");
assert.deepEqual([...api.findMergedRecognizedTextCues([cue(1, undefined)])], [], "missing text is not flagged");

// --- 2. acceptMergedRecognizedText replaces the body with the recognized text, touching nothing else ---
const fullCue = { id: 1, start: 10, end: 12, text: mergedOcr, x: 50, y: 8 };
const accepted = api.acceptMergedRecognizedText([fullCue, { id: 2, start: 20, end: 22, text: "Corner" }], 1);
assert.ok(accepted, "accept returns a result for a flagged cue");
const acceptedCue = accepted.find((item) => item.id === 1);
assert.equal(acceptedCue.text, "HOME 2 AWAY", "cue body becomes exactly the recognized text, TODO placeholder and bracket dropped");
assert.equal(acceptedCue.start, 10, "timing is untouched");
assert.equal(acceptedCue.end, 12, "timing is untouched");
assert.equal(acceptedCue.x, 50, "spatial position is untouched");
assert.deepEqual(accepted.find((item) => item.id === 2), { id: 2, start: 20, end: 22, text: "Corner" }, "other cues are untouched");

// Multiple recognized-text flags on the same cue (e.g. both ocr and speech
// duplicated into the same kept moment) are joined, not dropped.
const bothTags = "TODO: review scene cut (score 0.5) [also flagged by: ocr: HOME 2 AWAY] [also flagged by: speech: great save]";
const bothAccepted = api.acceptMergedRecognizedText([cue(1, bothTags)], 1);
assert.equal(bothAccepted[0].text, "HOME 2 AWAY\ngreat save", "multiple recognized texts on one cue are joined, not dropped");

// Nothing to accept: no matching cue id, no bracket, not a TODO placeholder at all.
assert.equal(api.acceptMergedRecognizedText([cue(1, mergedOcr)], 99), null, "unknown cue id returns null");
assert.equal(api.acceptMergedRecognizedText([cue(1, "TODO: review scene cut (score 0.3)")], 1), null, "a TODO cue with no recognized text returns null");
assert.equal(api.acceptMergedRecognizedText([cue(1, "OCR: HOME 2 AWAY")], 1), null, "a non-placeholder cue is left to the T-049.59 accept-text action, not this one");

// --- 3. the editor is actually wired to this: badge, per-cue action, click handler, undo, validation summary, CSS ---
assert.match(source, /findMergedRecognizedTextCues\(editorCues\)/, "renderEditorCues computes the merged-recognized-text flag set");
assert.match(source, /has-merged-recognized-text/, "flagged cues get a dedicated list-item class");
assert.match(source, /data-action="accept-merged-text">Use recognized text</, "flagged cues get a dedicated per-cue action button");

const clickHandler = source.slice(source.indexOf('if (button.dataset.action === "accept-merged-text")'), source.indexOf('startEditingCue(cue);'));
assert.notEqual(clickHandler.indexOf('acceptMergedRecognizedText(editorCues, id)'), -1, "click handler calls acceptMergedRecognizedText with the clicked cue's id");
assert.notEqual(clickHandler.indexOf('setDestructiveUndoSnapshot(editorCues)'), -1, "click handler snapshots before the destructive change, so Undo last cue change restores it");
assert.notEqual(clickHandler.indexOf('renderEditorCues()'), -1, "click handler re-renders after accepting");
assert.notEqual(clickHandler.indexOf('updateVttAnnotation()'), -1, "click handler refreshes the live preview after accepting");
assert.notEqual(clickHandler.indexOf('saveEditorCues()'), -1, "click handler persists the accepted cue");

assert.match(functionSource(source, "findCueValidationIssues"), /findMergedRecognizedTextCues\(cues\), "Recognized text available"/, "the consolidated validation summary (T-049.46) lists this as its own issue, separate from the bare placeholder warning");
assert.match(source, /vtt-editor__merged-recognized-text-warning/, "a dedicated toolbar notice exists for this case");
assert.match(css, /\.vtt-editor__list li\.has-merged-recognized-text,/, "the flagged list item gets the shared warning styling");

// This is a rendering/authoring-assist fix, not a persistence or export format change.
assert.doesNotMatch(functionSource(source, "buildVtt"), /findMergedRecognizedTextCues|acceptMergedRecognizedText/, "export format is untouched by this slice");
assert.doesNotMatch(functionSource(source, "saveEditorCues"), /findMergedRecognizedTextCues|acceptMergedRecognizedText/, "persistence format is untouched by this slice");

// --- 4. falsifiability: prove this fails against a /tmp copy of the pre-change script.js ---
// Pin to the exact commit this slice starts from, not HEAD: once this slice's
// own commit lands, HEAD carries the fix, so a HEAD-relative baseline would
// stop proving anything the moment it is committed (the exact trap T-049.64
// fixed for verify-t04963.js). Never git checkout/stash the real repo for this.
const baselineCommit = "3ae8ca44189fd8a1312b9d64faf63cfd656efd08";
const preChangeSource = execFileSync("git", ["show", `${baselineCommit}:script.js`], {
  cwd: repoRoot,
  encoding: "utf8"
});

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-t04966-"));
const tmpScriptPath = path.join(tmpDir, "script.js");
fs.writeFileSync(tmpScriptPath, preChangeSource);
const preChangeCopy = fs.readFileSync(tmpScriptPath, "utf8");
fs.rmSync(tmpDir, { recursive: true, force: true });

assert.doesNotMatch(
  preChangeCopy,
  /function findMergedRecognizedTextCues/,
  "test setup: the pinned /tmp baseline must predate this slice's fix"
);
assert.doesNotMatch(
  preChangeCopy,
  /data-action="accept-merged-text"/,
  "test setup: the pinned /tmp baseline must lack the per-cue action"
);

assert.throws(
  () => functionSource(preChangeCopy, "findMergedRecognizedTextCues"),
  /findMergedRecognizedTextCues must exist/,
  "regression check: this verifier fails against the pre-change /tmp copy because the function does not exist yet"
);

console.log("T-049.66 merged-suggestion recognized-text accept verification: pass");
