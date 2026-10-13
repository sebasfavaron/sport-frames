#!/usr/bin/env bash
# Tell a corrupted whisper.cpp model apart from any other failure to load it.
#
# The model directory (~/runtime/voice-system/models, a symlink onto the
# external USB disk at /mnt/rpi) has a record of silently corrupting files:
# this exact model's sha256 changed between reads after a 2026-09-30 USB
# fault (ledger f-046/rb-160), and the disk has logged live ext4 corruption
# since 2026-10-12 (f-060). This script compares a model file's sha256
# against a hash pinned here from the upstream Hugging Face release, so a
# caller can report "corrupt, re-download it" instead of a bare whisper-cli
# failure that could just as easily be memory pressure.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: check-whisper-model.sh MODEL

Compares MODEL's sha256 against a hash pinned in this script for known
whisper.cpp model filenames. Exits:
  0  sha256 matches the pinned hash
  4  sha256 does not match (one-line mismatch message)
  2  MODEL's filename has no pinned hash (unknown/unpinned model)

The verdict (not the file content) is cached under
${XDG_CACHE_HOME:-~/.cache}/sport-frames/, keyed by the model's absolute
path, size and mtime, so a repeat run against an unchanged file does not
re-read it.
EOF
  exit 2
}

[[ $# -eq 1 ]] || usage

model=$1

[[ -f "$model" ]] || { echo "error: model not found: $model" >&2; exit 2; }
[[ -r "$model" ]] || { echo "error: model not readable: $model" >&2; exit 2; }

base=$(basename "$model")

# Pinned upstream hashes, by filename. Source: Hugging Face LFS metadata for
# ggerganov/whisper.cpp, read via
#   curl -sI https://huggingface.co/ggerganov/whisper.cpp/resolve/main/<filename>
# The `x-linked-etag` response header on an LFS-tracked file is its sha256
# (confirmed against `x-xet-hash`'s git-lfs oid record and the matching
# `x-linked-size` for this file, read 2026-10-13).
declare -A pinned_sha256=(
  [ggml-large-v3-turbo-q5_0.bin]="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
)

# Override for tests: SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256 replaces the
# pinned hash for a recognized filename, so verify-t04962.js can exercise
# match/mismatch against tiny fake model files without depending on the real
# 574MB download or the real upstream hash.
if [[ -n "${SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256:-}" && -n "${pinned_sha256[$base]:-}" ]]; then
  pinned_sha256[$base]="$SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256"
fi

pin="${pinned_sha256[$base]:-}"
if [[ -z "$pin" ]]; then
  echo "error: no pinned checksum for $base — unknown/unpinned model, cannot verify" >&2
  exit 2
fi

cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/sport-frames"
mkdir -p "$cache_dir"

abs_model=$(readlink -f "$model")
size=$(stat -c%s "$model")
mtime=$(stat -c%Y "$model")
cache_key=$(printf '%s:%s:%s' "$abs_model" "$size" "$mtime" | sha256sum | cut -d' ' -f1)
cache_file="$cache_dir/$cache_key.sha256"

if [[ -f "$cache_file" ]]; then
  actual=$(cat "$cache_file")
else
  actual=$(sha256sum "$model" | cut -d' ' -f1)
  echo "$actual" > "$cache_file"
fi

if [[ "$actual" == "$pin" ]]; then
  echo "ok: $base sha256 matches the pinned hash ($pin)"
  exit 0
fi

echo "error: $base sha256 mismatch — got $actual, expected $pin (corrupted, re-download it)" >&2
exit 4
