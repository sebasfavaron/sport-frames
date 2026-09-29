const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const script = path.join(repoRoot, "tools", "suggest-ocr-vtt.sh");
const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

assert.ok(fs.existsSync(script), "tools/suggest-ocr-vtt.sh exists");
assert.ok(fs.statSync(script).mode & 0o111, "tools/suggest-ocr-vtt.sh is executable");

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
  const result = runExpectFailure(["a.mp4", "b.mp4", "c.mp4", "d.mp4", "e.mp4"]);
  assert.equal(result.failed, true, "more than four arguments fails");
  assert.equal(result.status, 2, "more than four arguments exits 2");
}
{
  const result = runExpectFailure(["/tmp/sport-frames-does-not-exist.mp4"]);
  assert.equal(result.failed, true, "missing video fails");
  assert.equal(result.status, 1, "missing video exits 1");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-ocr-"));
const scoreboardVideo = path.join(tmpDir, "scoreboard.mp4");
const flatVideo = path.join(tmpDir, "flat.mp4");

try {
  // A plain segment cuts into a segment carrying a rendered on-screen
  // scoreboard string: a scene cut lands at the boundary into the text, so
  // the frame sampled right at the cut candidate reliably contains it.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=darkgreen:s=320x180:d=2:r=10",
    "-f", "lavfi", "-i", "color=c=navy:s=320x180:d=2:r=10",
    "-filter_complex",
    `[1:v]drawtext=fontfile=${fontFile}:text='HOME 2 AWAY 1':fontcolor=white:fontsize=28:` +
      "x=(w-text_w)/2:y=(h-text_h)/2[t1];[0:v][t1]concat=n=2:v=1:a=0",
    "-pix_fmt", "yuv420p", scoreboardVideo,
  ]);

  // One flat, text-free segment: no scene cuts and no cues at all.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=2:r=10",
    "-pix_fmt", "yuv420p", flatVideo,
  ]);

  // Bad threshold/min-gap arguments must be rejected before touching ffmpeg.
  assert.equal(runExpectFailure([scoreboardVideo, "1.5"]).status, 2, "threshold above 1 exits 2");
  assert.equal(runExpectFailure([scoreboardVideo, "0.3", "0"]).status, 2, "zero min-gap exits 2");

  const output = run([scoreboardVideo, "0.1", "0.5"]);
  assert.match(output, /^WEBVTT\n/, "output starts with the WEBVTT header");
  assert.match(output, /ocr-1\n/, "cue carries an ocr- identifier");
  assert.match(
    output,
    /HOME 2 AWAY 1/,
    `cue body contains the rendered on-screen text, got: ${output}`,
  );
  assert.match(output, /OCR: /, "cue body is explicitly labeled as OCR output, not authored text");

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
  assert.equal(cues.length, 1, `expected exactly 1 OCR cue, got ${cues.length}`);
  assert.ok(Math.abs(cues[0].start - 2.0) < 0.15, `cue starts near the cut at 2.0s, got ${cues[0].start}`);

  // A cut-free, text-free video must yield only the header, not an error.
  const flatOutput = run([flatVideo, "0.30", "0.4"]);
  assert.match(flatOutput, /^WEBVTT\n\n?$/, "a cut-free, text-free video yields only the WEBVTT header");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.55 OCR-to-WebVTT suggestion verification: pass");
