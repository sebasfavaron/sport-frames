#!/usr/bin/env bash
# Emit review-only WebVTT candidates for frozen-video intervals detected by FFmpeg.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-freeze-vtt.sh VIDEO [NOISE_DB] [MIN_SECONDS]

Uses FFmpeg freezedetect. Writes WebVTT to stdout.
Defaults: NOISE_DB=-60, MIN_SECONDS=0.5
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 3 ]] || usage

video=$1
noise_db=${2:--60}
min_seconds=${3:-0.5}

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
[[ "$noise_db" =~ ^-?[0-9]+([.][0-9]+)?$ ]] || { echo "error: NOISE_DB must be numeric, e.g. -60" >&2; exit 2; }
[[ "$min_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($min_seconds > 0) }" || {
  echo "error: MIN_SECONDS must be greater than zero" >&2
  exit 2
}
for command in ffmpeg ffprobe awk; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 127; }
done

if ! ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$video" | grep -q .; then
  echo "error: video has no video stream" >&2
  exit 1
fi

log=$(mktemp)
trap 'rm -f "$log"' EXIT
LC_ALL=C ffmpeg -nostdin -hide_banner -i "$video" \
  -vf "freezedetect=n=${noise_db}dB:d=${min_seconds}" -an -f null - 2>"$log"

awk '
  function timestamp(seconds, milliseconds, hours, minutes, secs) {
    milliseconds = int(seconds * 1000 + 0.5)
    hours = int(milliseconds / 3600000)
    minutes = int((milliseconds % 3600000) / 60000)
    secs = int((milliseconds % 60000) / 1000)
    milliseconds %= 1000
    return sprintf("%02d:%02d:%02d.%03d", hours, minutes, secs, milliseconds)
  }
  BEGIN { print "WEBVTT\n" }
  /lavfi.freezedetect.freeze_start:/ {
    line = $0
    sub(/^.*lavfi.freezedetect.freeze_start: /, "", line)
    start = line + 0
  }
  /lavfi.freezedetect.freeze_end:/ {
    if (start == "") next
    line = $0
    sub(/^.*lavfi.freezedetect.freeze_end: /, "", line)
    end = line + 0
    if (end > start) {
      count++
      print "freeze-" count
      print timestamp(start) " --> " timestamp(end)
      print "TODO: review frozen-video interval\n"
    }
    start = ""
  }
' "$log"
