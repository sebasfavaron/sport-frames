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

## Preview de anotación en vivo

Abrí la página con `?annotation-preview` (por ejemplo
`http://localhost:8000/?annotation-preview`). El panel opt-in actualiza progreso, segundo actual
y caption activo en cada scrub; **Copy current anchor** copia un `<p data-at="…">` listo para
pegar. Usa APIs nativas de URL y Clipboard: no guarda estado, no edita captions y no es una UI de
autoría.

## Anotaciones temporizadas WebVTT

El video default carga `assets/default.vtt` con el estándar nativo [WebVTT](https://www.w3.org/TR/webvtt1/).
El browser activa el cue que corresponde a cada `currentTime` durante el scrub y la página lo dibuja
arriba del video. Para otra secuencia permanente, reemplazá ese archivo por cues revisados:

```vtt
WEBVTT

00:04.500 --> 00:09.500
Seguimiento de la jugada
```

Es un formato interoperable con reproductores y editores que exportan VTT. No hay editor, estado,
ni servicio: para videos locales subidos en la página, la capa default se desactiva para no mostrar
anotaciones de otro video.

## Desarrollo local

No hay build step. Cualquier server estático sirve:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Deploy

GitHub Pages sirve directo desde `main` / raíz — cualquier push a `main` se refleja en la demo.
