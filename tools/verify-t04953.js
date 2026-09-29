const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const script = path.join(repoRoot, "tools", "suggest-scenecut-vtt.sh");

assert.ok(fs.existsSync(script), "tools/suggest-scenecut-vtt.sh exists");
assert.ok(fs.statSync(script).mode & 0o111, "tools/suggest-scenecut-vtt.sh is executable");

const run = (args, opts = {}) =>
  execFileSync("bash", [script, ...args], { encoding: "utf8", ...opts });

const runExpectFailure = (args) => {
  try {
    run(args);
    return { failed: false };
  } catch (error) {
    return { failed: true, status: error.status, stderr: error.stderr };
  }
};

// Usage / validation paths need no ffmpeg work and no fixture video.
{
  const result = runExpectFailure([]);
  assert.equal(result.failed, true, "no arguments fails");
  assert.equal(result.status, 2, "no arguments exits 2");
}
{
  const result = runExpectFailure(["/tmp/sport-frames-does-not-exist.mp4"]);
  assert.equal(result.failed, true, "missing video fails");
  assert.equal(result.status, 1, "missing video exits 1");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-scenecut-"));
const cutsVideo = path.join(tmpDir, "cuts.mp4");
const flatVideo = path.join(tmpDir, "flat.mp4");

try {
  // Three 1s solid-color segments: hard scene-score spikes at 1.000s and 2.000s.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=lime:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1:r=10",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0",
    "-pix_fmt", "yuv420p", cutsVideo,
  ]);

  // One flat-color segment: no scene cuts at all.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=2:r=10",
    "-pix_fmt", "yuv420p", flatVideo,
  ]);

  // Bad threshold/min-gap arguments must be rejected before touching ffmpeg.
  assert.equal(runExpectFailure([cutsVideo, "1.5"]).status, 2, "threshold above 1 exits 2");
  assert.equal(runExpectFailure([cutsVideo, "0.3", "0"]).status, 2, "zero min-gap exits 2");

  const output = run([cutsVideo, "0.30", "0.4"]);
  assert.match(output, /^WEBVTT\n/, "output starts with the WEBVTT header");

  const timingLine = /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/g;
  const toSeconds = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  const cues = [];
  let match;
  while ((match = timingLine.exec(output))) {
    cues.push({
      start: toSeconds(match[1], match[2], match[3], match[4]),
      end: toSeconds(match[5], match[6], match[7], match[8]),
    });
  }

  assert.equal(cues.length, 2, `expected exactly 2 scene-cut cues, got ${cues.length}`);
  assert.ok(Math.abs(cues[0].start - 1.0) < 0.15, `first cue starts near 1.0s, got ${cues[0].start}`);
  assert.ok(Math.abs(cues[1].start - 2.0) < 0.15, `second cue starts near 2.0s, got ${cues[1].start}`);
  for (const cue of cues) {
    assert.ok(Math.abs(cue.end - cue.start - 0.4) < 0.05, "cue duration matches MIN_GAP_SECONDS");
  }
  assert.match(output, /scenecut-1\n/, "first cue carries a scenecut- identifier");
  assert.match(output, /scenecut-2\n/, "second cue carries a scenecut- identifier");
  assert.match(output, /TODO: review scene cut \(score \d+\.\d{3}\)/, "cue body is an explicit review TODO with the raw score");

  // A high threshold should gate out the weaker (0.64) cut, keeping only the harder cut.
  const gated = run([cutsVideo, "0.99", "0.4"]);
  const gatedCount = (gated.match(timingLine) || []).length;
  assert.equal(gatedCount, 1, "raising the threshold above the weaker cut's score drops it");

  // A video with no scene changes must produce a header with zero cues, not an error.
  const flatOutput = run([flatVideo, "0.30", "0.4"]);
  assert.match(flatOutput, /^WEBVTT\n\n?$/, "a cut-free video yields only the WEBVTT header");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.53 scene-cut WebVTT suggestion verification: pass");
