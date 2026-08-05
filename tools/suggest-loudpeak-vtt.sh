#!/usr/bin/env bash
# Emit review-only WebVTT candidates for sustained loud audio intervals detected by FFmpeg.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: suggest-loudpeak-vtt.sh VIDEO [THRESHOLD_DB] [MIN_SECONDS]

Uses FFmpeg astats over 100ms windows. Writes WebVTT to stdout.
Defaults: THRESHOLD_DB=-18, MIN_SECONDS=0.5
EOF
  exit 2
}

[[ $# -ge 1 && $# -le 3 ]] || usage

video=$1
threshold_db=${2:--18}
min_seconds=${3:-0.5}

[[ -f "$video" ]] || { echo "error: video not found: $video" >&2; exit 1; }
[[ "$threshold_db" =~ ^-?[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($threshold_db <= 0) }" || {
  echo "error: THRESHOLD_DB must be numeric and no greater than zero, e.g. -18" >&2
  exit 2
}
[[ "$min_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk "BEGIN { exit !($min_seconds > 0) }" || {
  echo "error: MIN_SECONDS must be greater than zero" >&2
  exit 2
}
for command in ffmpeg ffprobe awk; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 127; }
done

if ! ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$video" | grep -q .; then
  echo "error: video has no audio stream" >&2
  exit 1
fi

log=$(mktemp)
trap 'rm -f "$log"' EXIT
LC_ALL=C ffmpeg -nostdin -hide_banner -i "$video" \
  -af "aresample=48000,asetnsamples=n=4800:p=1,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level" \
  -f null - 2>"$log"

awk -v threshold="$threshold_db" -v minimum="$min_seconds" '
  function timestamp(seconds, milliseconds, hours, minutes, secs) {
    milliseconds = int(seconds * 1000 + 0.5)
    hours = int(milliseconds / 3600000)
    minutes = int((milliseconds % 3600000) / 60000)
    secs = int((milliseconds % 60000) / 1000)
    milliseconds %= 1000
    return sprintf("%02d:%02d:%02d.%03d", hours, minutes, secs, milliseconds)
  }
  function emit(end) {
    if (start != "" && end - start + 0.000001 >= minimum) {
      count++
      print "loudpeak-" count
      print timestamp(start) " --> " timestamp(end)
      print "TODO: review loud/crowd-reaction interval\n"
    }
    start = ""
  }
  BEGIN { print "WEBVTT\n" }
  /frame:[0-9]+.*pts_time:/ {
    line = $0
    sub(/^.*pts_time:/, "", line)
    split(line, fields, /[[:space:]]/)
    time = fields[1] + 0
  }
  /lavfi.astats.Overall.RMS_level=/ {
    line = $0
    sub(/^.*lavfi.astats.Overall.RMS_level=/, "", line)
    rms = line + 0
    loud = line != "-inf" && rms >= threshold
    if (loud && start == "") start = time
    if (!loud && start != "") emit(time)
    last_time = time
  }
  END { if (start != "") emit(last_time + 0.1) }
' "$log"
