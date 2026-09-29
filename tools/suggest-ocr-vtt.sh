#!/usr/bin/env bash
# Emit review-only WebVTT cues carrying on-screen text recognized by Tesseract
# OCR at FFmpeg scene-cut keyframes.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-ocr-vtt.sh VIDEO [SCENE_THRESHOLD] [MIN_GAP_SECONDS] [LANG]

Finds visual cut candidates with the same FFmpeg scene-score detector as
suggest-scenecut-vtt.sh, extracts the frame at each candidate, and runs
Tesseract OCR on it. A frame with no recognized text produces no cue; a
frame with text emits a WebVTT cue whose body IS the recognized text
(prefixed "OCR:"), unlike the other suggest-*-vtt.sh scripts, which only
emit generic "TODO: review ..." placeholders. OCR text can still be wrong,
partial, or read from an unrelated on-screen element (scoreboard, sponsor
overlay, broadcast graphic) rather than a sports annotation, so it still
needs review before use.
Defaults: SCENE_THRESHOLD=0.30, MIN_GAP_SECONDS=0.5, LANG=eng
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 4 ]] || usage

video=$1
threshold=${2:-0.30}
min_gap=${3:-0.5}
lang=${4:-eng}

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
[[ "$threshold" =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] && awk "BEGIN { exit !($threshold >= 0 && $threshold <= 1) }" || {
  echo "error: SCENE_THRESHOLD must be between 0 and 1" >&2
  exit 2
}
[[ "$min_gap" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($min_gap > 0) }" || {
  echo "error: MIN_GAP_SECONDS must be greater than zero" >&2
  exit 2
}
for command in ffmpeg ffprobe awk tesseract; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 127; }
done

if ! ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$video" | grep -q .; then
  echo "error: video has no video stream" >&2
  exit 1
fi

duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$video")
awk -v d="$duration" 'BEGIN { exit !(d > 0) }' || { echo "error: could not read a positive video duration" >&2; exit 1; }

metadata=$(mktemp)
workdir=$(mktemp -d)
trap 'rm -f "$metadata"; rm -rf "$workdir"' EXIT
ffmpeg -hide_banner -loglevel error -nostdin -i "$video" \
  -vf "select='gt(scene,${threshold})',metadata=print:file=${metadata}" \
  -an -f null -

# Same de-duplication rule as suggest-scenecut-vtt.sh: keep a candidate only
# if it is at least MIN_GAP_SECONDS after the previous kept candidate.
mapfile -t timestamps < <(awk -v min_gap="$min_gap" '
  BEGIN { last_time = -1 }
  /pts_time:/ {
    split($0, parts, "pts_time:")
    time = parts[2] + 0
    if (last_time < 0 || time - last_time >= min_gap) {
      print time
      last_time = time
    }
  }
' "$metadata")

echo "WEBVTT"
echo

count=0
for time in "${timestamps[@]}"; do
  end=$(awk -v t="$time" -v g="$min_gap" -v d="$duration" 'BEGIN { e = t + g; if (e > d) e = d; print e }')
  awk -v t="$time" -v e="$end" 'BEGIN { exit !(e > t) }' || continue

  frame="$workdir/frame.png"
  rm -f "$frame"
  ffmpeg -hide_banner -loglevel error -nostdin -i "$video" -ss "$time" -frames:v 1 "$frame" -y >/dev/null 2>&1 || true
  [[ -f "$frame" ]] || continue

  text=$(tesseract "$frame" - -l "$lang" --psm 6 2>/dev/null | tr -s '[:space:]' ' ')
  # Trim leading/trailing whitespace and strip a WebVTT cue-terminating
  # sequence so OCR noise can never break the emitted cue block.
  text=$(printf '%s' "$text" | sed -e 's/^ *//' -e 's/ *$//')
  text=${text//-->/->}
  [[ -n "$text" ]] || continue

  count=$((count + 1))
  timestamp_start=$(awk -v s="$time" 'BEGIN {
    ms = int(s * 1000 + 0.5); h = int(ms/3600000); m = int((ms%3600000)/60000); sec = int((ms%60000)/1000); ms %= 1000
    printf "%02d:%02d:%02d.%03d", h, m, sec, ms
  }')
  timestamp_end=$(awk -v s="$end" 'BEGIN {
    ms = int(s * 1000 + 0.5); h = int(ms/3600000); m = int((ms%3600000)/60000); sec = int((ms%60000)/1000); ms %= 1000
    printf "%02d:%02d:%02d.%03d", h, m, sec, ms
  }')

  echo "ocr-$count"
  echo "$timestamp_start --> $timestamp_end"
  echo "OCR: $text"
  echo
done
