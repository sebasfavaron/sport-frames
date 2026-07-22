#!/usr/bin/env bash
# Emit review-only WebVTT candidates for sustained quiet intervals detected by FFmpeg.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-silence-vtt.sh VIDEO [NOISE_DB] [MIN_SECONDS]

Uses FFmpeg silencedetect. Writes WebVTT to stdout.
Defaults: NOISE_DB=-35, MIN_SECONDS=0.5
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 3 ]] || usage

video=$1
noise_db=${2:--35}
min_seconds=${3:-0.5}

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
[[ "$noise_db" =~ ^-?[0-9]+([.][0-9]+)?$ ]] || { echo "error: NOISE_DB must be numeric, e.g. -35" >&2; exit 2; }
[[ "$min_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($min_seconds > 0) }" || {
  echo "error: MIN_SECONDS must be greater than zero" >&2
  exit 2
}
command -v ffmpeg >/dev/null || { echo "error: ffmpeg is required" >&2; exit 127; }

if ! ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$video" | grep -q .; then
  echo "error: video has no audio stream" >&2
  exit 1
fi

log=$(mktemp)
trap 'rm -f "$log"' EXIT
LC_ALL=C ffmpeg -nostdin -hide_banner -i "$video" \
  -af "silencedetect=noise=${noise_db}dB:d=${min_seconds}" -f null - 2>"$log"

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
  /silence_start:/ {
    line = $0
    sub(/^.*silence_start: /, "", line)
    start = line + 0
  }
  /silence_end:/ {
    if (start == "") next
    line = $0
    sub(/^.*silence_end: /, "", line)
    split(line, fields, / \|/)
    end = fields[1] + 0
    if (end > start) {
      count++
      print "quiet-" count
      print timestamp(start) " --> " timestamp(end)
      print "TODO: review quiet interval\n"
    }
    start = ""
  }
' "$log"
