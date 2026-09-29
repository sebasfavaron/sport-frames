#!/usr/bin/env bash
# Emit review-only WebVTT candidates for scene-cut frames detected by FFmpeg.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-scenecut-vtt.sh VIDEO [SCENE_THRESHOLD] [MIN_GAP_SECONDS]

Uses FFmpeg's scene score (the same detector as suggest-caption-anchors.sh) to
find visual cut candidates and writes WebVTT to stdout: one short review cue
per cut, starting at the cut frame and lasting MIN_GAP_SECONDS.
Defaults: SCENE_THRESHOLD=0.30, MIN_GAP_SECONDS=0.5
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 3 ]] || usage

video=$1
threshold=${2:-0.30}
min_gap=${3:-0.5}

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
[[ "$threshold" =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] && awk "BEGIN { exit !($threshold >= 0 && $threshold <= 1) }" || {
  echo "error: SCENE_THRESHOLD must be between 0 and 1" >&2
  exit 2
}
[[ "$min_gap" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($min_gap > 0) }" || {
  echo "error: MIN_GAP_SECONDS must be greater than zero" >&2
  exit 2
}
for command in ffmpeg ffprobe awk; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 127; }
done

if ! ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$video" | grep -q .; then
  echo "error: video has no video stream" >&2
  exit 1
fi

duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$video")
awk -v d="$duration" 'BEGIN { exit !(d > 0) }' || { echo "error: could not read a positive video duration" >&2; exit 1; }

metadata=$(mktemp)
trap 'rm -f "$metadata"' EXIT
ffmpeg -hide_banner -loglevel error -nostdin -i "$video" \
  -vf "select='gt(scene,${threshold})',metadata=print:file=${metadata}" \
  -an -f null -

awk -v duration="$duration" -v min_gap="$min_gap" '
  function timestamp(seconds, milliseconds, hours, minutes, secs) {
    milliseconds = int(seconds * 1000 + 0.5)
    hours = int(milliseconds / 3600000)
    minutes = int((milliseconds % 3600000) / 60000)
    secs = int((milliseconds % 60000) / 1000)
    milliseconds %= 1000
    return sprintf("%02d:%02d:%02d.%03d", hours, minutes, secs, milliseconds)
  }
  BEGIN { print "WEBVTT\n"; last_time = -1 }
  /pts_time:/ {
    split($0, parts, "pts_time:")
    time = parts[2] + 0
    have_time = 1
    next
  }
  /lavfi.scene_score=/ && have_time {
    split($0, parts, "=")
    score = parts[2] + 0
    if (last_time < 0 || time - last_time >= min_gap) {
      end = time + min_gap
      if (end > duration) end = duration
      if (end > time) {
        count++
        print "scenecut-" count
        print timestamp(time) " --> " timestamp(end)
        printf "TODO: review scene cut (score %.3f)\n\n", score
        last_time = time
      }
    }
    have_time = 0
  }
' "$metadata"
