# sport-frames

Scroll-scrubbed video, la técnica que usan los sitios de deportes para mostrar la secuencia de
un gol cuadro por cuadro (por ejemplo [La Nación](https://www.lanacion.com.ar)): un solo
`<video>`, sticky en pantalla, y el progreso del scroll controla `video.currentTime`. No hay
`play()`/`pause()` — el scroll literalmente scrubea el frame.

Demo: **https://sebasfavaron.github.io/sport-frames/**

## Cómo funciona

- HTML/CSS/JS nativo, sin librerías ni build step.
- Un contenedor (`#scrolly`) mide varios viewports de alto (`height` en `vh`, proporcional a la
  duración del video). Adentro, `.scrolly__stage` es `position: sticky; top: 0; height: 100vh`,
  así que el video queda fijo en pantalla mientras el contenedor scrollea "detrás".
- En cada evento de `scroll` (throttleado con `requestAnimationFrame`), se calcula el progreso
  con `getBoundingClientRect()` sobre el contenedor:
  `progress = -rect.top / (rect.height - innerHeight)`, clampeado a `[0, 1]`.
- Ese progreso se mapea directo a `video.currentTime = progress * video.duration`.
- Los captions superpuestos (izquierda/derecha) se muestran u ocultan comparando el progreso
  actual contra un `data-at` (0–1) definido en cada `<p>`.
- Un `IntersectionObserver` evita correr el cálculo cuando el bloque no está en viewport.

## Video default

`assets/default.mp4` viene re-codificado con `-g 1` (keyframe en cada frame) para que el seek
sea instantáneo al scrollear — sin eso, el `<video>` tiene que decodificar desde el keyframe
anterior en cada seek y el efecto se traba. Se re-encodeó así:

```bash
ffmpeg -i input.mp4 -vf "scale=848:-2" -c:v libx264 -preset slow -crf 24 \
  -g 1 -keyint_min 1 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 96k assets/default.mp4
```

## Probar con tu propio video

En la página hay un input de archivo arriba del todo: elegís un video local y reemplaza el
default en el momento (vía `URL.createObjectURL`, sin subir nada a ningún servidor). El alto
del track se recalcula solo según la duración del nuevo video.

Para que scrubee suave, conviene que el video tenga muchos keyframes (lo ideal es re-codificarlo
como arriba antes de subirlo como default permanente del repo).

## Sugerir anchors de captions

No hace falta calcular cada `data-at` a ojo. Para un primer borrador, el helper usa el detector de
cambios de escena ya incluido en FFmpeg y devuelve `<p>` listos para pegar:

```bash
tools/suggest-caption-anchors.sh mi-jugada.mp4 0.12 2 > captions.html
```

Revisá los frames sugeridos, cambiá los `TODO`, y pegá los elementos dentro de
`.scrolly__captions` en `index.html`. El detector sugiere timing visual; no inventa el relato ni
identifica jugadas. Detalle de decisión, límites y alternativas: [`docs/live-annotations.md`](docs/live-annotations.md).

## Sugerir cues WebVTT por silencios

Para detectar intervalos de audio sostenidamente quietos, el helper de
[FFmpeg `silencedetect`](https://ffmpeg.org/ffmpeg-filters.html#silencedetect) produce cues WebVTT
portables:

```bash
tools/suggest-silence-vtt.sh mi-jugada.mp4 -35 0.5 > silencios.vtt
```

El segundo argumento es el umbral en dB; el tercero, la duración mínima del silencio. Cada cue dice
`TODO: review quiet interval`: es una sugerencia de timing de audio, no una anotación automática de
una jugada. Revisalo, editá/eliminá los cues en una herramienta VTT y cargalo temporalmente con el
input WebVTT de la página. No sube video/audio ni agrega UI, estado o backend.

## Sugerir cues WebVTT por video congelado

Para marcar intervalos donde la imagen queda congelada, el detector
[FFmpeg `freezedetect`](https://ffmpeg.org/ffmpeg-filters.html#freezedetect) puede generar cues
WebVTT portables para revisión:

```bash
tools/suggest-freeze-vtt.sh mi-jugada.mp4 -60 0.5 > congelados.vtt
```

El segundo argumento es la tolerancia de diferencia de imagen en dB; el tercero, la duración
mínima. Cada cue dice `TODO: review frozen-video interval`: un freeze puede ser transición,
pausa o problema de la fuente, no una jugada. Revisalo, editá/eliminá los cues en una herramienta
VTT y cargalo temporalmente con el input WebVTT de la página. No sube video ni agrega UI, estado,
backend o dependencia de runtime.

## Preview de anotación en vivo

Abrí la página con `?annotation-preview` (por ejemplo
`http://localhost:8000/?annotation-preview`). El panel opt-in actualiza progreso, segundo actual
y caption activo en cada scrub; **Copy current anchor** copia un `<p data-at="…">` listo para
pegar. Usa APIs nativas de URL y Clipboard: no guarda estado, no edita captions y no es una UI de
autoría.

## Anotaciones temporizadas WebVTT

La página usa el estándar nativo [WebVTT](https://www.w3.org/TR/webvtt1/), pero no carga una pista
de anotaciones de muestra. Para probar un VTT existente contra el video actual (inclusive un video
local), elegí el archivo en **Cargar anotaciones WebVTT para este video**: se vuelve la pista activa
temporalmente mediante las APIs nativas de archivos y `<track>`, sin subirlo ni guardarlo.

### Editor WebVTT en la página

Usá **Abrir editor WebVTT** en la página (`/?vtt-editor` sigue abriéndolo directamente). **Use scrub
time** captura el segundo visible como inicio o fin; con el editor abierto, `I` marca el inicio y `O`
marca el fin sin sacar el foco del video (los atajos no actúan al escribir en un campo). Mientras un
cue está abierto para edición, `Alt+←` / `Alt+→` mueve todo su timing 100ms antes o después sin
cambiar la duración; guardá el cue para conservar el cambio. La lista permite editar texto/timing, retimear, eliminar y mover cues hacia arriba o abajo sin cambiar sus tiempos. El orden manual se conserva en el browser; la exportación sigue el orden cronológico que requiere la pista. El campo opcional **Speaker** atribuye el cue a alguien y se exporta
como el span de voz WebVTT estándar `<v Nombre>` (y se vuelve a parsear al importar). El campo
opcional **Cue identifier** nombra el cue y se exporta como el identificador WebVTT estándar (la
línea previa al timing); al importar se recupera esa línea. Se depura de `-->` y saltos de línea,
y se conserva en **Duplicate** y **Merge with next** (identificador del primer cue). El selector
**Text alignment** (`start` / `center` / `end`) se exporta como el cue setting WebVTT estándar
`align:` y se vuelve a parsear al importar (`align:left` / `align:right` se normalizan a
`start` / `end`); `center` es el default y no altera cues previos. **Merge with next** combina un cue con el
siguiente cronológico en uno solo (texto unido en líneas separadas, timing desde el inicio del
primero hasta el fin más tardío de ambos), útil para resolver los avisos de solapamiento o
timing casi duplicado con una sola acción. **Offset all cues** desplaza todos los inicios y finales por la misma cantidad de segundos para sincronizar una pista; rechaza desplazamientos que llevarían un cue antes de `0.000s`. Cada cue también tiene un control **Drag timing**: arrastralo para mover el cue sobre la duración del video sin cambiar su duración. **Undo delete** restaura una vez el último cue eliminado o el último **Clear all cues**. **Apply to video** reemplaza la pista WebVTT activa con los cues actuales;
**Copy .vtt** copia el archivo `WEBVTT` completo y **Download .vtt** guarda el mismo contenido, siempre ordenado por inicio. **Import cues .srt** y **Download .srt**
permiten mover cues hacia y desde el formato [SubRip (.srt)](https://en.wikipedia.org/wiki/SubRip), común fuera del browser: la exportación numera los cues
secuencialmente con timestamps de coma decimal y sin línea de cue settings (SRT no tiene equivalente a `line`/`position`/`size`/`align`/identificador; un Speaker
se exporta como prefijo de texto plano `Nombre: texto`), y la importación agrega los cues igual que la importación WebVTT existente. El video sigue usando WebVTT
como pista activa; SRT es sólo un formato de intercambio adicional. Los cues persisten sólo en
`localStorage` de ese browser: no hay cuenta, backend, subida ni dependencia externa.

## Desarrollo local

No hay build step. Cualquier server estático sirve:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Deploy

GitHub Pages sirve directo desde `main` / raíz — cualquier push a `main` se refleja en la demo.
