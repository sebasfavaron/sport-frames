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

const context = {};
vm.createContext(context);
vm.runInContext(
  `${functionSource("escapeVttCueText")}\n${functionSource("formatVttCueText")}\n${functionSource("wrapCueTextSelection")}`,
  context
);

assert.equal(context.formatVttCueText("plain & safe"), "plain &amp; safe", "plain cue text keeps standard entity escaping");
assert.equal(context.formatVttCueText("A <b>bold</b>, <i>italic</i>, <u>underlined</u> cue"), "A <b>bold</b>, <i>italic</i>, <u>underlined</u> cue", "the three supported WebVTT formatting tags survive export");
assert.equal(context.formatVttCueText("<B>LOUD</B>"), "<b>LOUD</b>", "supported tags are accepted case-insensitively and normalized");
assert.equal(context.formatVttCueText("<script>alert(1)</script> <c.red>x</c>"), "&lt;script&gt;alert(1)&lt;/script&gt; &lt;c.red&gt;x&lt;/c&gt;", "unsupported markup stays literal instead of becoming active HTML/WebVTT markup");
assert.equal(context.wrapCueTextSelection("great goal", 6, 10, "b"), "great <b>goal</b>", "bold wraps only the selected text");
assert.equal(context.wrapCueTextSelection("great goal", 0, 5, "i"), "<i>great</i> goal", "italic supports a selection at the start");
assert.equal(context.wrapCueTextSelection("great goal", 0, 10, "u"), "<u>great goal</u>", "underline supports the complete cue body");
assert.equal(context.wrapCueTextSelection("great goal", 5, 5, "b"), null, "an empty selection is rejected");
assert.equal(context.wrapCueTextSelection("great goal", 0, 5, "script"), null, "an unsupported tag is rejected");

const parserContext = {};
vm.createContext(parserContext);
vm.runInContext(
  `${functionSource("unescapeVttCueText")}\n${functionSource("parseVttTimestamp")}\n${functionSource("parseVttCues")}`,
  parserContext
);
const parsed = parserContext.parseVttCues("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA <b>bold</b> &amp; <u>safe</u> cue\n");
assert.equal(parsed.length, 1, "a formatted WebVTT cue imports");
assert.equal(parsed[0].text, "A <b>bold</b> & <u>safe</u> cue", "format tags and escaped literal text survive import");

assert.match(script, /data-format-cue-text="b"[\s\S]*data-format-cue-text="i"[\s\S]*data-format-cue-text="u"/, "the form exposes bold, italic, and underline controls");
assert.match(script, /wrapCueTextSelection\(textarea\.value, textarea\.selectionStart, textarea\.selectionEnd, button\.dataset\.formatCueText\)/, "format controls use the textarea's actual selection");
assert.match(functionSource("buildVtt"), /formatVttCueText\(cue\.text\)/, "WebVTT export preserves only supported formatting tags");
assert.match(functionSource("updateVttAnnotation"), /element\.innerHTML = formatVttCueText\(cue\.text\)/, "the live overlay renders the same sanitized formatting");
assert.match(functionSource("saveEditorCues"), /const \{ start, end, text, x, y, size \} = cue/, "formatted cue source persists through the existing text field");
assert.doesNotMatch(functionSource("buildSrt"), /formatVttCueText/, "SRT export remains plain source text because SRT has no standard equivalent");

console.log("T-049.51 cue text formatting verification passed");
