#!/usr/bin/env bash
# Run every FFmpeg-based cue suggester against one clip and merge their cues
# into a single time-sorted, de-duplicated WebVTT, tagging which signal(s)
# produced each surviving cue.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-all-vtt.sh VIDEO

Runs suggest-scenecut-vtt.sh, suggest-black-vtt.sh, suggest-freeze-vtt.sh,
suggest-silence-vtt.sh, suggest-loudpeak-vtt.sh, suggest-ocr-vtt.sh, and
suggest-speech-vtt.sh against VIDEO with each suggester's default thresholds,
then merges every suggested cue into one WebVTT on stdout: sorted by start
time, and de-duplicated whenever two suggesters propose cues whose start and
end each land within 0.1s of a cue already kept (the earlier suggester in the
list above wins the kept identifier/body; the dropped suggester's name is
appended to the surviving cue's body as "also flagged by: NAME").

A suggester whose required stream (video or audio) is missing from VIDEO, or
whose required external tool (Tesseract, for suggest-ocr-vtt.sh; whisper-cli
and its model, for suggest-speech-vtt.sh, overridable via
SPORT_FRAMES_WHISPER_CLI/SPORT_FRAMES_WHISPER_MODEL) is not available, is
skipped with a warning on stderr. suggest-speech-vtt.sh failing to transcribe
at runtime (its whisper-cli exiting status 3, e.g. the model failing to load)
is also skipped with a warning, because that failure comes from a shared
model on this machine, not from the video, and must not discard the other
suggesters' cues. Any other suggester failure aborts this script with that
suggester's exit status. This wrapper adds no new signal, threshold, model, or
dependency: it only runs the existing per-signal suggesters and merges their
already-reviewed output.
EOF
  exit 2
}

[[ $# -eq 1 ]] || usage

video=$1
[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
for command in ffmpeg ffprobe awk; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 127; }
done

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# source-tag:script pairs, in de-dup priority order (earlier wins ties).
suggesters=(
  "scenecut:suggest-scenecut-vtt.sh"
  "black:suggest-black-vtt.sh"
  "freeze:suggest-freeze-vtt.sh"
  "quiet:suggest-silence-vtt.sh"
  "loudpeak:suggest-loudpeak-vtt.sh"
  "ocr:suggest-ocr-vtt.sh"
  "speech:suggest-speech-vtt.sh"
)

speech_whisper_cli="${SPORT_FRAMES_WHISPER_CLI:-/home/sebas/runtime/voice-system/build/whisper.cpp/bin/whisper-cli}"
speech_whisper_model="${SPORT_FRAMES_WHISPER_MODEL:-/home/sebas/runtime/voice-system/models/ggml-large-v3-turbo-q5_0.bin}"

raw=$(mktemp)
trap 'rm -f "$raw"' EXIT

for entry in "${suggesters[@]}"; do
  source_tag=${entry%%:*}
  script_name=${entry#*:}
  if [[ "$script_name" == "suggest-ocr-vtt.sh" ]] && ! command -v tesseract >/dev/null; then
    echo "warning: skipping $source_tag ($script_name requires tesseract, which is not installed)" >&2
    continue
  fi
  if [[ "$script_name" == "suggest-speech-vtt.sh" ]] \
    && { [[ ! -x "$speech_whisper_cli" ]] || [[ ! -r "$speech_whisper_model" ]]; }; then
    echo "warning: skipping $source_tag ($script_name requires whisper-cli and its model, which are not available)" >&2
    continue
  fi
  set +e
  output=$("$script_dir/$script_name" "$video" 2>/dev/null)
  status=$?
  set -e
  if [[ $status -eq 0 ]]; then
    # Every suggest-*-vtt.sh cue is exactly: identifier line, timing line,
    # single-line body, blank separator. Flatten each cue to one TSV row.
    printf '%s\n' "$output" | awk -v tag="$source_tag" '
      BEGIN { state = 0 }
      /^WEBVTT/ { next }
      /^[[:space:]]*$/ { state = 0; next }
      state == 0 { ident = $0; state = 1; next }
      state == 1 { timing = $0; state = 2; next }
      state == 2 { print tag "\t" ident "\t" timing "\t" $0; state = 0; next }
    ' >> "$raw"
  elif [[ $status -eq 1 ]]; then
    echo "warning: skipping $source_tag ($script_name has no matching stream)" >&2
  elif [[ "$script_name" == "suggest-speech-vtt.sh" ]] && [[ $status -eq 3 ]]; then
    echo "warning: skipping $source_tag (whisper-cli failed to transcribe; its model may be unavailable or corrupted)" >&2
  else
    echo "error: $script_name failed with status $status" >&2
    exit "$status"
  fi
done

awk -F'\t' '
  function abs(x) { return x < 0 ? -x : x }
  function to_seconds(ts,    parts) {
    split(ts, parts, ":")
    return parts[1] * 3600 + parts[2] * 60 + parts[3]
  }
  function timestamp(seconds, milliseconds, hours, minutes, secs) {
    milliseconds = int(seconds * 1000 + 0.5)
    hours = int(milliseconds / 3600000)
    minutes = int((milliseconds % 3600000) / 60000)
    secs = int((milliseconds % 60000) / 1000)
    milliseconds %= 1000
    return sprintf("%02d:%02d:%02d.%03d", hours, minutes, secs, milliseconds)
  }
  {
    n++
    tag[n] = $1
    ident[n] = $2
    body[n] = $4
    split($3, t, " --> ")
    startv[n] = to_seconds(t[1])
    endv[n] = to_seconds(t[2])
    order[n] = n
  }
  END {
    # Stable insertion sort by start time; ties keep suggester priority order.
    for (i = 2; i <= n; i++) {
      j = i
      while (j > 1 && startv[order[j - 1]] > startv[order[j]]) {
        tmp = order[j - 1]; order[j - 1] = order[j]; order[j] = tmp
        j--
      }
    }
    print "WEBVTT\n"
    kept = 0
    for (i = 1; i <= n; i++) {
      idx = order[i]
      dup = 0
      for (k = 1; k <= kept; k++) {
        if (abs(startv[idx] - keptstart[k]) <= 0.1 && abs(endv[idx] - keptend[k]) <= 0.1) {
          dup = k
          break
        }
      }
      if (dup) {
        keptbody[dup] = keptbody[dup] " [also flagged by: " tag[idx] "]"
      } else {
        kept++
        keptstart[kept] = startv[idx]
        keptend[kept] = endv[idx]
        keptident[kept] = ident[idx]
        keptbody[kept] = body[idx]
      }
    }
    for (k = 1; k <= kept; k++) {
      print keptident[k]
      print timestamp(keptstart[k]) " --> " timestamp(keptend[k])
      print keptbody[k] "\n"
    }
  }
' "$raw"
