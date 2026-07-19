# Tasks

Concrete repo-local work for sport-frames.

Fields:
- `id`: stable handle for future chats
- `status`: current execution state
- `goal`: concrete outcome
- `source`: where it came from
- `workspace`: repo path or task workspace
- `next_step`: immediate next action
- `notes`: short implementation context
- `tags`: labels for cross-task search

---

## Items

### T-049.1 - Suggest scroll caption anchors from video scene changes
- status: `done`
- goal: add a zero-dependency workflow that converts FFmpeg scene-change candidates into `data-at` caption anchor suggestions
- source: `T-049; Sebas 2026-07-19 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `tools/suggest-caption-anchors.sh` wraps FFmpeg `select`/`scene` and emits paste-ready normalized `data-at` caption elements; research/decision in `docs/live-annotations.md`
  - verified 2026-07-19: `bash -n tools/suggest-caption-anchors.sh`; `./tools/suggest-caption-anchors.sh assets/default.mp4 0.09 2` emitted a valid opening anchor plus `data-at="0.210"` from the 3.080s scene-score candidate; static server returned HTTP 200 for `/` and `/docs/live-annotations.md`
- tags: [project:sport-frames, type:scene-anchor-suggestions, criterion:live-annotations]
