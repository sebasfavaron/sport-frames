#!/usr/bin/env bash
# Emit review-only WebVTT candidates for black-video intervals detected by FFmpeg.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-black-vtt.sh VIDEO [PIXEL_THRESHOLD] [MIN_SECONDS]

Uses FFmpeg blackdetect. Writes WebVTT to stdout.
Defaults: PIXEL_THRESHOLD=0.10, MIN_SECONDS=0.5
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 3 ]] || usage

video=$1
pixel_threshold=${2:-0.10}
min_seconds=${3:-0.5}

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
[[ "$pixel_threshold" =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] && awk "BEGIN { exit !($pixel_threshold >= 0 && $pixel_threshold <= 1) }" || {
  echo "error: PIXEL_THRESHOLD must be between 0 and 1" >&2
  exit 2
}
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
  -vf "blackdetect=pic_th=0.98:pix_th=${pixel_threshold}:d=${min_seconds}" -an -f null - 2>"$log"

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
  /black_start:/ {
    line = $0
    sub(/^.*black_start:/, "", line)
    split(line, fields, / black_end:/)
    start = fields[1] + 0
    end = fields[2] + 0
    if (end > start) {
      count++
      print "black-" count
      print timestamp(start) " --> " timestamp(end)
      print "TODO: review black-video interval\n"
    }
  }
' "$log"
