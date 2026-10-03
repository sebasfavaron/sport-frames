const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const script = path.join(repoRoot, "tools", "suggest-speech-vtt.sh");

// whisper.cpp's own smoke-test clip (public-domain speech). Read in place from
// the voice-system checkout, never copied into this repo (no media or model
// weights are committed here).
const knownSpeechSample =
  "/home/sebas/runtime/voice-system/src/whisper.cpp/samples/jfk.wav";
const knownWord = /country/i;

assert.ok(fs.existsSync(script), "tools/suggest-speech-vtt.sh exists");
assert.ok(fs.statSync(script).mode & 0o111, "tools/suggest-speech-vtt.sh is executable");

const run = (args, env) =>
  spawnSync("bash", [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

{
  const result = run([]);
  assert.equal(result.status, 2, "no arguments exits 2");
}
{
  const result = run(["a.mp4", "en", "extra"]);
  assert.equal(result.status, 2, "more than two arguments exits 2");
}
{
  const result = run(["/tmp/sport-frames-does-not-exist.mp4"]);
  assert.equal(result.status, 1, "missing video exits 1");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-speech-"));
const noAudioVideo = path.join(tmpDir, "no-audio.mp4");
const toneVideo = path.join(tmpDir, "tone.mp4");
const fakeModel = path.join(tmpDir, "fake-model.bin");
const fakeWhisper = path.join(tmpDir, "fake-whisper.sh");

const ffmpeg = (args) => {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
};

// Stands in for whisper-cli so the wrapper's parsing and filtering are tested
// deterministically and fast. FAKE_WHISPER_MODE=fail simulates a whisper crash.
fs.writeFileSync(
  fakeWhisper,
  `#!/usr/bin/env bash
if [[ "\${FAKE_WHISPER_MODE:-}" == "fail" ]]; then
  echo "fake whisper: model load failed" >&2
  exit 3
fi
of=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "-of" ]]; then of="$2"; shift; fi
  shift
done
cat > "$of.vtt" <<'VTT'
WEBVTT

00:00:00.000 --> 00:00:01.000
!!!!!!!!

00:00:01.000 --> 00:00:02.000
[BLANK_AUDIO]

00:00:02.000 --> 00:00:04.000
 we need to press now
VTT
`,
);
fs.chmodSync(fakeWhisper, 0o755);
fs.writeFileSync(fakeModel, "not a real model; the fake whisper ignores it\n");

try {
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=1:r=5",
    "-pix_fmt", "yuv420p", noAudioVideo,
  ]);
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=4:r=5",
    "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=16000:d=4",
    "-shortest", "-pix_fmt", "yuv420p", "-c:a", "aac", toneVideo,
  ]);

  {
    const result = run([noAudioVideo]);
    assert.equal(result.status, 1, "a video with no audio stream exits 1");
    assert.match(result.stderr, /no audio stream/, "the missing-audio-stream error names the problem");
  }

  {
    const result = run([noAudioVideo], { SPORT_FRAMES_WHISPER_CLI: "/tmp/sport-frames-no-such-binary" });
    assert.equal(result.status, 127, "a missing whisper-cli binary exits 127");
    assert.match(result.stderr, /whisper-cli not found/, "the error names the missing whisper-cli binary");
  }
  {
    const result = run([noAudioVideo], { SPORT_FRAMES_WHISPER_MODEL: "/tmp/sport-frames-no-such-model.bin" });
    assert.equal(result.status, 127, "a missing whisper model exits 127");
    assert.match(result.stderr, /whisper model not found/, "the error names the missing whisper model");
  }

  // Hallucinated segments ("!!!!", "[BLANK_AUDIO]") are dropped; only the real
  // segment becomes a cue, with whisper's own timing.
  {
    const result = run([toneVideo], {
      SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
      SPORT_FRAMES_WHISPER_MODEL: fakeModel,
    });
    assert.equal(result.status, 0, `tone clip with fake whisper exits 0: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "WEBVTT\n\nspeech-1\n00:00:02.000 --> 00:00:04.000\nSPEECH: we need to press now\n\n",
      "only the real transcribed segment survives, with whisper's timing and the SPEECH: prefix",
    );
  }

  // A whisper crash is a real failure: the wrapper exits with whisper's status
  // and reports it, instead of silently emitting nothing.
  {
    const result = run([toneVideo], {
      SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
      SPORT_FRAMES_WHISPER_MODEL: fakeModel,
      FAKE_WHISPER_MODE: "fail",
    });
    assert.equal(result.status, 3, "a whisper-cli failure exits 3");
    assert.match(result.stderr, /whisper-cli failed/, "the failure names whisper-cli");
    assert.match(result.stderr, /model load failed/, "whisper's own error is forwarded");
  }

  // Real-whisper check. Whisper on this Pi has intermittently returned "!!!!"
  // for the same known clip (identical binary, model and args; see the
  // T-049.56 notes in docs/live-annotations.md). The wrapper's own behaviour
  // is covered by the fake-whisper checks above, so when whisper itself does
  // not transcribe the sample, this check is skipped loudly rather than
  // failing on whisper's health. When whisper is healthy, the wrapper must
  // transcribe the known word.
  const whisperCli =
    process.env.SPORT_FRAMES_WHISPER_CLI ||
    "/home/sebas/runtime/voice-system/build/whisper.cpp/bin/whisper-cli";
  const whisperModel =
    process.env.SPORT_FRAMES_WHISPER_MODEL ||
    "/home/sebas/runtime/voice-system/models/ggml-large-v3-turbo-q5_0.bin";

  if (!fs.existsSync(knownSpeechSample) || !fs.existsSync(whisperCli) || !fs.existsSync(whisperModel)) {
    console.log(
      "T-049.56 speech-to-WebVTT verification: skipping real-transcription check, " +
        "the known sample, whisper-cli or the model is not present; the deterministic checks above passed",
    );
  } else {
    const jfkVideo = path.join(tmpDir, "jfk.mp4");
    ffmpeg([
      "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=11:r=5",
      "-i", knownSpeechSample,
      "-shortest", "-pix_fmt", "yuv420p", "-c:a", "aac", jfkVideo,
    ]);

    const result = run([jfkVideo, "en"]);
    assert.equal(result.status, 0, `suggest-speech-vtt.sh exited ${result.status}: ${result.stderr}`);

    if (!knownWord.test(result.stdout)) {
      const direct = spawnSync(
        whisperCli,
        ["-m", whisperModel, "-f", knownSpeechSample, "-t", "3", "-l", "en", "-np"],
        { encoding: "utf8" },
      );
      if (knownWord.test(direct.stdout)) {
        assert.fail(`whisper transcribes the known sample but the wrapper lost it: ${result.stdout}`);
      }
      console.log(
        "T-049.56 speech-to-WebVTT verification: skipping real-transcription check, " +
          `whisper-cli itself does not transcribe the known sample on this machine right now ` +
          `(got: ${direct.stdout.trim().slice(0, 120)}); the deterministic checks above passed`,
      );
    } else {
      const output = result.stdout;
      assert.match(output, /^WEBVTT\n/, "output starts with the WEBVTT header");
      assert.match(output, /speech-1\n/, "cue carries a speech- identifier");
      assert.match(output, /SPEECH: /, "cue body is explicitly labeled as machine-transcribed, not authored");

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
      assert.ok(cues.length >= 1, `expected at least 1 speech cue, got ${cues.length}`);
      assert.ok(cues[0].end > cues[0].start, "the cue has positive duration");
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.56 speech-to-WebVTT suggestion verification: pass");
