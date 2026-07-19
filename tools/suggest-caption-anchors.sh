#!/usr/bin/env bash
# Suggest caption anchor points from FFmpeg scene-change scores.
# Output is paste-ready HTML for sport-frames' existing data-at mechanism.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/suggest-caption-anchors.sh VIDEO [SCENE_THRESHOLD] [MIN_GAP_SECONDS]

Defaults:
  SCENE_THRESHOLD  0.30  (FFmpeg scene score; lower finds more motion/changes)
  MIN_GAP_SECONDS  1.50  (drops nearby candidates)

Example:
  tools/suggest-caption-anchors.sh my-play.mp4 0.12 2 > captions.html

Review the suggested points against the video, replace TODO text, then paste the
<p> elements inside .scrolly__captions in index.html. This suggests timing only;
it does not claim to identify a goal, player, or play.
EOF
}

if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
  usage
  exit 0
fi

video=${1:-}
threshold=${2:-0.30}
min_gap=${3:-1.50}

if [[ -z "$video" || ! -f "$video" ]]; then
  usage >&2
  exit 2
fi
for command in ffmpeg ffprobe awk; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 127; }
done
for number in "$threshold" "$min_gap"; do
  awk -v n="$number" 'BEGIN { exit !(n ~ /^[0-9]+([.][0-9]+)?$/) }' || {
    echo "Expected a non-negative decimal, got: $number" >&2
    exit 2
  }
done

metadata=$(mktemp "${TMPDIR:-/tmp}/sport-frames-scenes.XXXXXX")
trap 'rm -f "$metadata"' EXIT

duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$video")
if ! awk -v d="$duration" 'BEGIN { exit !(d > 0) }'; then
  echo "Could not read a positive video duration." >&2
  exit 1
fi

# FFmpeg's built-in scene variable compares consecutive decoded frames. metadata
# records timestamp + score only for frames that pass the threshold.
ffmpeg -hide_banner -loglevel error -nostdin -i "$video" \
  -vf "select='gt(scene,${threshold})',metadata=print:file=${metadata}" \
  -an -f null -

printf '# Suggested sport-frames caption anchors\n'
printf '# video: %s | duration: %.3fs | scene threshold: %s | min gap: %ss\n' "$video" "$duration" "$threshold" "$min_gap"
printf '# Review each frame. data-at is scroll progress, not seconds.\n\n'
printf '<p class="scrolly__caption" data-at="0.000" data-side="left">TODO: opening context</p>\n'

awk -v duration="$duration" -v min_gap="$min_gap" '
  /pts_time:/ {
    split($0, parts, "pts_time:")
    time = parts[2] + 0
    have_time = 1
    next
  }
  /lavfi.scene_score=/ && have_time {
    split($0, parts, "=")
    score = parts[2] + 0
    if (time >= min_gap && time - last_time >= min_gap) {
      progress = time / duration
      if (progress > 1) progress = 1
      side = (count % 2 == 0) ? "right" : "left"
      printf "<p class=\"scrolly__caption\" data-at=\"%.3f\" data-side=\"%s\">TODO: scene change (%.3fs, score %.3f)</p>\n", progress, side, time, score
      last_time = time
      count++
    }
    have_time = 0
  }
' "$metadata"
