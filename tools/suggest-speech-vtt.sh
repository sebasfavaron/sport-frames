#!/usr/bin/env bash
# Emit review-only WebVTT cues carrying speech transcribed by whisper.cpp.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-speech-vtt.sh VIDEO [LANG]

Extracts the audio track with FFmpeg and transcribes it with the local
whisper.cpp build (binary at SPORT_FRAMES_WHISPER_CLI, model at
SPORT_FRAMES_WHISPER_MODEL), then re-emits whisper's own segment timing as
WebVTT on stdout, one cue per recognized speech segment, each body prefixed
"SPEECH:" so a reviewer can tell it was machine-transcribed, not authored.
Unlike the other suggest-*-vtt.sh scripts, the cue body is real transcribed
text, not a generic "TODO: review ..." placeholder, but it is still not a
claim that any segment is an annotation-worthy play: commentary/crowd audio
can be transcribed wrong, partially, or out of context. Review/edit/delete
each suggestion in the in-page editor or an external VTT-capable tool before
use, the same as every prior suggester.

LANG is a whisper.cpp language code (default "en"; "auto" lets whisper
detect it). Segments with no letters or digits outside bracketed tags (whisper's
"!!!!" or "[BLANK_AUDIO]" on silence or tones) are dropped. If the video has no
audio stream, or whisper-cli/the model are not available, this exits with a
warning instead of a cue.
Defaults: LANG=en
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage

video=$1
lang=${2:-en}

whisper_cli="${SPORT_FRAMES_WHISPER_CLI:-/home/sebas/runtime/voice-system/build/whisper.cpp/bin/whisper-cli}"
whisper_model="${SPORT_FRAMES_WHISPER_MODEL:-/home/sebas/runtime/voice-system/models/ggml-large-v3-turbo-q5_0.bin}"

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
for command in ffmpeg ffprobe; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 127; }
done
[[ -x "$whisper_cli" ]] || {
  echo "error: whisper-cli not found or not executable: $whisper_cli (set SPORT_FRAMES_WHISPER_CLI)" >&2
  exit 127
}
[[ -r "$whisper_model" ]] || {
  echo "error: whisper model not found or unreadable: $whisper_model (set SPORT_FRAMES_WHISPER_MODEL)" >&2
  exit 127
}

if ! ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$video" | grep -q .; then
  echo "error: video has no audio stream" >&2
  exit 1
fi

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

wav="$workdir/audio.wav"
ffmpeg -hide_banner -loglevel error -nostdin -i "$video" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$wav"

log="$workdir/whisper.log"
if ! "$whisper_cli" -m "$whisper_model" -f "$wav" -t 3 -l "$lang" -ovtt -of "$workdir/out" -np \
  >"$log" 2>&1; then
  echo "error: whisper-cli failed:" >&2
  cat "$log" >&2
  exit 3
fi
[[ -f "$workdir/out.vtt" ]] || { echo "error: whisper-cli produced no output file" >&2; exit 3; }

echo "WEBVTT"
echo

awk '
  function print_cue() {
    gsub(/-->/, "->", text)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", text)
    # whisper hallucinates on silence/tones ("!!!!", "[BLANK_AUDIO]"): keep
    # only segments with real letters or digits outside bracketed tags.
    stripped = text
    gsub(/\[[^]]*\]/, "", stripped)
    if (stripped !~ /[A-Za-z0-9]/) { return }
    n++
    print "speech-" n
    print timing
    print "SPEECH: " text
    print ""
  }
  BEGIN { in_cue = 0; text = "" }
  /^WEBVTT/ { next }
  /-->/ {
    if (in_cue) { print_cue() }
    timing = $0
    text = ""
    in_cue = 1
    next
  }
  /^[[:space:]]*$/ {
    if (in_cue) { print_cue() }
    in_cue = 0
    next
  }
  {
    if (in_cue) {
      line = $0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      text = (text == "" ? line : text " " line)
    }
  }
  END { if (in_cue) { print_cue() } }
' "$workdir/out.vtt"
