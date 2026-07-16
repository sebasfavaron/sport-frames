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

## Desarrollo local

No hay build step. Cualquier server estático sirve:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Deploy

GitHub Pages sirve directo desde `main` / raíz — cualquier push a `main` se refleja en la demo.
