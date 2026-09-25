const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");
const regionLiteral = source.match(/  const VTT_CUE_REGIONS = \{[\s\S]*?\n  \};/);
const helpers = source.match(/  const cueSpatial = \(cue\) => \(\{[\s\S]*?\n  const cueVoice =/);
assert.ok(regionLiteral && helpers, "region helpers are present in shipped script");

const context = { result: null };
vm.createContext(context);
vm.runInContext(`
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const CUE_TEXT_ALIGN_VALUES = ["start", "center", "end"];
${regionLiteral[0]}
${helpers[0].replace(/\n  const cueVoice =$/, "")}
result = { VTT_CUE_REGIONS, cueRegion, cuePreviewSpatial, cueSettings, regionDefinitions };
`, context);
const { VTT_CUE_REGIONS, cueRegion, cuePreviewSpatial, cueSettings, regionDefinitions } = context.result;

assert.deepEqual(Object.keys(VTT_CUE_REGIONS), ["top-left", "top-right", "bottom-left", "bottom-right"]);
assert.equal(cueRegion({ region: "top-left" }), "top-left");
assert.equal(cueRegion({ region: "unknown" }), "");
assert.equal(cueSettings({ region: "bottom-right" }), "region:bottom-right align:center");
assert.equal(cueSettings({ x: 23, y: 71, size: 42 }), "line:71%,center position:23%,center size:42% align:center");
assert.deepEqual(JSON.parse(JSON.stringify(cuePreviewSpatial({ region: "top-right", x: 1, y: 2, size: 3 }))), {
  label: "Top right", x: 55, y: 5, size: 40, regionAnchor: "0%,0%", viewportAnchor: "55%,5%"
});
const definitions = regionDefinitions([
  { region: "top-left" }, { region: "top-left" }, { region: "bottom-right" }, { region: "invalid" }
]);
assert.equal((definitions.match(/REGION/g) || []).length, 2, "used region definitions are deduplicated");
assert.match(definitions, /REGION\nid:top-left\nwidth:40%\nlines:3\nregionanchor:0%,0%\nviewportanchor:5%,5%/);
assert.match(definitions, /id:bottom-right[\s\S]*viewportanchor:55%,75%/);

assert.match(source, /const regions = regionDefinitions\(editorCues\);[\s\S]*WEBVTT\\n\\n\$\{regions\}/, "export includes REGION blocks before cues");
assert.match(source, /const regionMatch = \/[\s\S]*?region:\(\[\^\\s\]\+\)[\s\S]*?const region = regionMatch && VTT_CUE_REGIONS/, "import accepts only supported region ids");
assert.match(source, /<select name="region">[\s\S]*Top left[\s\S]*Bottom right[\s\S]*<\/select>/, "cue form exposes fixed region presets");
assert.match(source, /form\.elements\.region\.value = cueRegion\(cue\)/, "editing restores the cue region");
assert.match(source, /region: VTT_CUE_REGIONS\[form\.elements\.region\.value\]/, "form input updates region preview state");
assert.match(source, /const region = VTT_CUE_REGIONS\[form\.elements\.region\.value\][\s\S]*editorCues\.push\([\s\S]*region \}\)/, "new cues store the selected region");
assert.match(source, /\.\.\.\(region \? \{ region \} : \{\}\)/, "local browser storage preserves supported regions");
assert.match(source, /clone\.region = cue\.region/, "duplicate preserves region");
assert.match(source, /merged\.region = cue\.region/, "merge preserves the first cue region");
assert.match(source, /\.\.\.cuePreviewSpatial\(cue\)/, "live authored-cue preview uses fixed region placement");
assert.doesNotMatch(source.match(/function buildSrt\(\) \{[\s\S]*?\n  \}/)[0], /region/, "SRT export remains unchanged");

console.log("T-049.52 WebVTT region verification: pass");
