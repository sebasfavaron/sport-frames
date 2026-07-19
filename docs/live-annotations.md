# Live/dynamic annotation research — T-049.1

## Decision

Use FFmpeg's existing `scene` score to suggest initial `data-at` anchors offline.

- Fits current zero-build/no-dependency page: FFmpeg is only an optional authoring CLI; runtime stays static HTML/CSS/JS.
- Produces paste-ready elements for the existing caption mechanism.
- Timing is assisted, copy remains human-reviewed. Scene change/motion does not reliably mean "goal", "player", or "key play".
- No upload, service account, browser CV, or annotation UI.

## Implemented workflow

```bash
tools/suggest-caption-anchors.sh my-play.mp4 0.12 2 > captions.html
```

- Argument 2: FFmpeg scene-score threshold. Start at `0.30` for cuts; lower it (for example `0.12`) for continuous sports footage with camera motion.
- Argument 3: minimum seconds between suggestions.
- Review the frames, replace `TODO` text, then paste the generated `<p>` elements inside `.scrolly__captions` in `index.html`.
- `data-at` is already normalized scroll progress, so no manual seconds-to-progress conversion is needed.

## Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| FFmpeg `select` + `scene` | Existing local tool; no runtime dependency; returns timestamped visual-change candidates | Selected |
| PySceneDetect | Better detector choices/CSV/UI, but adds Python install and duplicate value for this first slice | Defer |
| Browser live authoring controls | Could record current scrub position, but needs state/export UX and is a new authoring surface | Defer |
| Sports CV/telestrator SaaS | Can label plays/objects, but needs upload/API/vendor evaluation and still needs editorial review | Out of scope |

Sources: [FFmpeg select filter](https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect), [FFmpeg metadata filter](https://ffmpeg.org/ffmpeg-filters.html#metadata_002c-ametadata), [PySceneDetect](https://www.scenedetect.com/).
