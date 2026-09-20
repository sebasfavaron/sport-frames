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

function constSource(name) {
  const start = source.indexOf(`  const ${name} = `);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(";\n", start);
  assert.notEqual(end, -1, `${name} must terminate with a semicolon`);
  return source.slice(start, end + 1);
}

// Minimal HTMLElement stub so isShortcutHelpToggle's `instanceof HTMLElement`
// guard behaves the same way it does in a real browser.
class HTMLElement {
  constructor(tagName, { isContentEditable = false } = {}) {
    this.tagName = tagName;
    this.isContentEditable = isContentEditable;
  }
}

const context = { HTMLElement };
vm.createContext(context);
vm.runInContext(
  `${constSource("VTT_EDITOR_SHORTCUTS")}\n${functionSource("isShortcutHelpToggle")}\nthis.api={VTT_EDITOR_SHORTCUTS,isShortcutHelpToggle};`,
  context
);

const { VTT_EDITOR_SHORTCUTS, isShortcutHelpToggle } = context.api;

// The shortcut list is real data: every entry documents at least one key and
// a human-readable description, and it covers each shortcut shipped in past
// T-049 slices (mark in/out, save, cue navigation, timing nudge) plus itself.
assert.ok(Array.isArray(VTT_EDITOR_SHORTCUTS) && VTT_EDITOR_SHORTCUTS.length >= 8, "shortcut list has real entries");
VTT_EDITOR_SHORTCUTS.forEach((entry) => {
  assert.ok(Array.isArray(entry.keys) && entry.keys.length > 0, `entry has at least one key: ${JSON.stringify(entry)}`);
  assert.ok(typeof entry.description === "string" && entry.description.trim().length > 0, `entry has a description: ${JSON.stringify(entry)}`);
});
const descriptions = VTT_EDITOR_SHORTCUTS.map((entry) => entry.description).join(" | ");
assert.match(descriptions, /mark in|Mark in/, "documents the mark-in shortcut");
assert.match(descriptions, /mark out|Mark out/i, "documents the mark-out shortcut");
assert.match(descriptions, /Save the cue/i, "documents the save-cue shortcut");
assert.match(descriptions, /next cue/i, "documents the next-cue navigation shortcut");
assert.match(descriptions, /previous cue/i, "documents the previous-cue navigation shortcut");
assert.match(descriptions, /earlier/i, "documents the earlier-nudge shortcut");
assert.match(descriptions, /later/i, "documents the later-nudge shortcut");
assert.ok(VTT_EDITOR_SHORTCUTS.some((entry) => entry.keys.includes("?")), "documents its own toggle key");
assert.ok(VTT_EDITOR_SHORTCUTS.some((entry) => entry.keys.includes("Esc")), "documents the close shortcut");

// isShortcutHelpToggle: "?" opens/closes the overlay unless the user is
// typing in a field, or a modifier other than Shift is held, or it's a
// synthetic key-repeat event.
const plainTarget = new HTMLElement("DIV");
const inputTarget = new HTMLElement("INPUT");
const textareaTarget = new HTMLElement("TEXTAREA");
const editableTarget = new HTMLElement("DIV", { isContentEditable: true });

assert.equal(isShortcutHelpToggle({ key: "?", target: plainTarget }), true, "plain ? toggles the overlay");
assert.equal(isShortcutHelpToggle({ key: "?", shiftKey: true, target: plainTarget }), true, "shift+/ (reported as ?) toggles the overlay");
assert.equal(isShortcutHelpToggle({ key: "?", target: inputTarget }), false, "? while typing in an input does not toggle");
assert.equal(isShortcutHelpToggle({ key: "?", target: textareaTarget }), false, "? while typing in a textarea does not toggle");
assert.equal(isShortcutHelpToggle({ key: "?", target: editableTarget }), false, "? inside a contenteditable element does not toggle");
assert.equal(isShortcutHelpToggle({ key: "?", altKey: true, target: plainTarget }), false, "Alt+? does not toggle (reserved for other shortcuts)");
assert.equal(isShortcutHelpToggle({ key: "?", ctrlKey: true, target: plainTarget }), false, "Ctrl+? does not toggle");
assert.equal(isShortcutHelpToggle({ key: "?", metaKey: true, target: plainTarget }), false, "Cmd+? does not toggle");
assert.equal(isShortcutHelpToggle({ key: "?", repeat: true, target: plainTarget }), false, "held-down repeat does not re-toggle");
assert.equal(isShortcutHelpToggle({ key: "i", target: plainTarget }), false, "unrelated keys do not toggle");

// Wiring: a discoverable toggle button, a dialog overlay populated from the
// shared shortcut list, and close paths (button, backdrop click, Escape).
assert.match(source, /class="vtt-editor__shortcut-help-toggle" data-action="toggle-shortcut-help"/, "editor exposes a discoverable shortcuts button");
assert.match(source, /class="vtt-editor__shortcut-help" hidden role="dialog" aria-modal="true"/, "overlay is a hidden-by-default modal dialog");
assert.match(source, /data-action="close-shortcut-help"/, "overlay has an explicit close button");
assert.match(source, /class="vtt-editor__shortcut-help-list"/, "overlay has a list container for shortcut entries");

assert.match(source, /VTT_EDITOR_SHORTCUTS\.forEach\(\(entry\) => \{/, "overlay list is built from the shared shortcut data, not duplicated markup");
assert.match(source, /dt\.innerHTML = entry\.keys\.map\(\(key\) => `<kbd>\$\{key\}<\/kbd>`\)\.join\("\+"\)/, "each shortcut renders its keys as <kbd> elements");

assert.match(source, /vttEditor\.querySelector\('\[data-action="toggle-shortcut-help"\]'\)\.addEventListener\("click", \(\) => \{\s*setShortcutHelpVisible\(shortcutHelp\.hidden\);/, "toggle button flips overlay visibility");
assert.match(source, /vttEditor\.querySelector\('\[data-action="close-shortcut-help"\]'\)\.addEventListener\("click", \(\) => setShortcutHelpVisible\(false\)\)/, "close button hides the overlay");
assert.match(source, /shortcutHelp\.addEventListener\("click", \(event\) => \{\s*if \(event\.target === shortcutHelp\) setShortcutHelpVisible\(false\);/, "clicking the backdrop closes the overlay");

const keydownHandlerStart = source.indexOf('document.addEventListener("keydown", (event) => {\n      if (vttEditor.hidden) return;\n      if (event.key === "Escape"');
assert.notEqual(keydownHandlerStart, -1, "the editor's global keydown handler checks Escape before the mark in/out shortcut");
const keydownHandler = source.slice(keydownHandlerStart, keydownHandlerStart + 700);
assert.match(keydownHandler, /if \(event\.key === "Escape" && !shortcutHelp\.hidden\) \{/, "Escape only closes an open overlay");
assert.match(keydownHandler, /setShortcutHelpVisible\(false\);\s*return;/, "Escape hides the overlay and stops further handling");
assert.match(keydownHandler, /if \(isShortcutHelpToggle\(event\)\) \{/, "the ? shortcut is checked in the same global handler");
assert.match(keydownHandler, /setShortcutHelpVisible\(shortcutHelp\.hidden\);\s*return;/, "? toggles the overlay and stops further handling");

// The overlay is transient UI chrome: it must not affect export or persistence.
assert.doesNotMatch(functionSource("buildVtt"), /shortcutHelp|VTT_EDITOR_SHORTCUTS/, "shortcut overlay does not affect WebVTT export");
assert.doesNotMatch(functionSource("buildSrt"), /shortcutHelp|VTT_EDITOR_SHORTCUTS/, "shortcut overlay does not affect SRT export");
assert.doesNotMatch(functionSource("saveEditorCues"), /shortcutHelp|VTT_EDITOR_SHORTCUTS/, "shortcut overlay state is not persisted");

assert.match(css, /\.vtt-editor__shortcut-help \{/, "overlay backdrop has dedicated styling");
assert.match(css, /\.vtt-editor__shortcut-help-panel \{/, "overlay panel has dedicated styling");
assert.match(css, /\.vtt-editor__shortcut-help\[hidden\] \{ display: none; \}/, "overlay is fully hidden when the hidden attribute is set");

assert.doesNotMatch(source, /new (Worker|WebSocket)\(|fetch\(|XMLHttpRequest|require\(["']express["']\)/, "no backend/network dependency introduced");

console.log("T-049.49 keyboard shortcuts help overlay verification: pass");
