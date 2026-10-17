#!/usr/bin/env node
"use strict";

// T-049.65 - decode native <track> cue text before the live overlay re-escapes it.
//
// Walking the generate -> review -> export loop with assets/default.mp4 surfaced
// a real bug: once an authored cue is applied to the video's native track
// ("Apply to video", T-049.12) or loaded from a local .vtt (T-049.5), the live
// overlay (updateVttAnnotation) read the browser's native TextTrackCue.text and
// passed it straight into formatVttCueText(). That function expects the same
// decoded, voice-tag-stripped plain text editorCues already store - but a native
// cue's .text is the raw WebVTT payload: still carrying a `<v Name>` wrapper (if
// any) and already entity-escaped (&amp;/&lt;/&gt;). Re-running that through
// formatVttCueText (which escapes again) doubled the escaping and left the raw
// `<v Name>` tag visible as literal text, instead of showing the plain annotation
// text an author typed, for any cue with a voice label or with &, <, or > in its
// body. This verifier extracts the shipped nativeCueText/formatVttCueText
// verbatim and proves the decode step fixes exactly that, then proves the bug
// reproduces against a fixed pre-change commit.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const vm = require("node:vm");

const repoRoot = path.join(__dirname, "..");
const scriptPath = path.join(repoRoot, "script.js");
const source = fs.readFileSync(scriptPath, "utf8");

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
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${functionSource(src, "escapeVttCueText")}\n` +
      `${functionSource(src, "formatVttCueText")}\n` +
      `${functionSource(src, "unescapeVttCueText")}\n` +
      `this.api={escapeVttCueText,formatVttCueText,unescapeVttCueText};`,
    context
  );
  return context.api;
}

// --- 1. nativeCueText exists on the shipped script and strips + decodes ---
const api = buildApi(source);
api.nativeCueText = vm.runInContext(
  `${functionSource(source, "unescapeVttCueText")}\n${functionSource(source, "nativeCueText")}\nnativeCueText`,
  vm.createContext({})
);

// Plain text with no voice, no special characters: unchanged.
assert.equal(api.nativeCueText("Gol de cabeza"), "Gol de cabeza", "plain text passes through");

// A native cue's raw payload for a voiced, entity-escaped, exactly as
// buildVtt()/escapeVttCueText would have written it for text `A & B < C`
// with voice `Commentator`.
const rawVoiced = "<v Commentator>A &amp; B &lt; C";
assert.equal(api.nativeCueText(rawVoiced), "A & B < C", "voice wrapper stripped and entities decoded");

// Inline <b>/<i>/<u> markup (never escaped by formatVttCueText/buildVtt) must
// survive the decode untouched, since it is meant to re-enter formatVttCueText.
assert.equal(api.nativeCueText("<v Ref>Roja <b>directa</b>"), "Roja <b>directa</b>", "inline markup survives decode");

// --- 2. end-to-end: decode then format matches what editorCues already show ---
// This is the exact two-step pipeline updateVttAnnotation now runs for native
// track cues: nativeCueText() then formatVttCueText() for safe innerHTML.
const rendered = api.formatVttCueText(api.nativeCueText(rawVoiced));
assert.equal(rendered, "A &amp; B &lt; C", "fixed pipeline renders the real text, single-escaped, no stray <v> tag");
assert.doesNotMatch(rendered, /<v /i, "no raw voice tag leaks into the rendered overlay");
assert.doesNotMatch(rendered, /&amp;amp;|&amp;lt;|&amp;gt;/, "entities are not double-escaped");

// --- 3. call-site wiring: updateVttAnnotation must route native cues through it ---
assert.match(source, /text: nativeCueText\(cue\.text\)/, "updateVttAnnotation decodes native cue text before formatting");

// --- 4. falsifiability: the pre-change call site reproduces the bug ---
// Pin to the exact commit this slice starts from (current HEAD before this
// change lands), not HEAD itself: once committed, HEAD carries the fix, so a
// HEAD-relative baseline would stop proving anything the moment this change
// is committed (the exact trap T-049.64 fixed for verify-t04963.js).
const baselineCommit = "b0bb3eb82f706c43896252f1ca82e83e8e32f24b";
const preChangeSource = execFileSync("git", ["show", `${baselineCommit}:script.js`], {
  cwd: repoRoot,
  encoding: "utf8",
});

assert.doesNotMatch(
  preChangeSource,
  /function nativeCueText/,
  "test setup: the pinned baseline must predate nativeCueText"
);
assert.match(
  preChangeSource,
  /text: cue\.text,\n\s*x: Number\.isFinite\(cue\.position\)/,
  "test setup: the pinned baseline's updateVttAnnotation passes the raw native cue.text straight through"
);

// Reproduce the pre-change pipeline: raw native cue.text straight into
// formatVttCueText, with no decode step at all.
const preChangeApi = buildApi(preChangeSource);
const buggyRendered = preChangeApi.formatVttCueText(rawVoiced);
assert.match(
  buggyRendered,
  /&lt;v Commentator&gt;/,
  `regression check: pre-change rendering must leak the raw voice tag as visible text: ${buggyRendered}`
);
assert.match(
  buggyRendered,
  /&amp;amp;/,
  `regression check: pre-change rendering must double-escape entities: ${buggyRendered}`
);

console.log("T-049.65 native-track cue text decode verification: pass");
