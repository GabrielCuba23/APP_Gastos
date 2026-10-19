# Regenerar el tutorial para clientes

Ejecuta los pasos desde la raíz del repositorio. No hacen falta credenciales de
clientes ni de Supabase. La demostración utiliza datos ficticios y simula las
respuestas de autenticación, perfiles y movimientos en el navegador. Las
solicitudes a otros destinos se bloquean durante la grabación.

## Requisitos

- Node y dependencias del proyecto (`npm ci`), incluido Playwright.
- Chromium en `/usr/bin/chromium` y el FFmpeg de Playwright. En este entorno
  `PLAYWRIGHT_BROWSERS_PATH=/workspace/tutorial-tools/browsers` apunta a sus
  recursos; `ffmpeg-1013/ffmpeg-linux` reutiliza `/usr/bin/ffmpeg`.
- Python 3, NumPy y sherpa-onnx para la voz neuronal; FFmpeg y FFprobe con
  H.264/libx264 y AAC. El montaje usa solo la biblioteca estándar de Python.
- Modelo Piper `es_MX-claude-high-int8`, español de México, WAV PCM mono de
  16 bits a 22050 Hz. Voz neuronal predeterminada, velocidad 0.95, dos hilos CPU.

Instala sherpa-onnx junto con su dependencia de núcleo en una sola operación.
Ambos comparten el espacio de nombres Python: instalarlos por separado con
`--no-deps` puede dejar una instalación incompleta.

```sh
python3 -m pip install --upgrade --target /workspace/tutorial-tools/python sherpa-onnx==1.13.8 numpy
```

Descarga el modelo de la [release oficial de sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-claude-high-int8.tar.bz2),
manteniendo TLS y las verificaciones de integridad. Si la API de GitHub Releases
(`repos/k2-fsa/sherpa-onnx/releases/tags/tts-models`) proporciona un `digest` del
asset, compara el SHA-256 antes de extraerlo. Estos son los fingerprints de los
archivos descargados en este entorno; no son un manifiesto oficial de checksums:

```text
archivo tar.bz2: 0f9fc9c07d2e17bdc0f5f33a657addae92085da85704cb86a861e59d32f3bbfa
modelo ONNX:    6aa528726d93cf32ee95dd214e2f9708dc956b3e8d3929a9f6fb9ea4a41ed743
```

Conserva
el `MODEL_CARD` y comprueba que estén presentes `es_MX-claude-high.onnx`,
`tokens.txt` y `espeak-ng-data`. La ficha del modelo identifica el conjunto de
datos y su licencia Apache 2.0; conserva esa atribución si redistribuyes el
modelo. El paquete proviene de k2-fsa/sherpa-onnx y la ficha enlaza a
HirCoir/Piper-TTS-Spanish. No añadas modelos ni binarios de herramientas al
repositorio.

La carpeta predeterminada es
`/workspace/tutorial-tools/neural/vits-piper-es_MX-claude-high-int8`; cámbiala
con `--model-dir`. El motor anterior está disponible solo mediante
`--engine legacy`: prefiere `espeak-ng` en `PATH` y, si falta, usa la instalación
local `/workspace/tutorial-tools/root` (`--tools-root`). No se activa como
respaldo silencioso si falla la voz neuronal.

## Grabación y montaje

1. `PYTHONPATH=/workspace/tutorial-tools/python python3 scripts/tutorial/prepare_audio.py` genera los WAV y actualiza
   `tutorial/guion.json`. La narración es sintética en español; cada escena deja
   un segundo antes y otro después de la voz. Los audios se guardan de forma
   predeterminada en `/workspace/tutorial-mi-balance`; usa `--output-dir` para
   otra ubicación. La raíz del repositorio se obtiene de la ubicación del
   script, sin fijar el nombre de la carpeta de la app. No regeneres los audios
   mientras esté en curso una grabación.
2. Inicia la web con `npm run dev -- --host 127.0.0.1` y ejecuta
   `PLAYWRIGHT_BROWSERS_PATH=/workspace/tutorial-tools/browsers node scripts/tutorial/capture.mjs`.
   Espera a que termine correctamente y cree
   `/workspace/tutorial-mi-balance/recording.json`. Graba la versión final sin
   `TUTORIAL_FAST=1`: el modo rápido solo sirve para ensayar las acciones.
3. Ejecuta `python3 scripts/tutorial/assemble.py`. Valida la cronología, coloca
   cada WAV mono PCM de 16 bits/22050 Hz en el inicio de su escena más un segundo
   y genera el MP4, los subtítulos WebVTT y la portada. También actualiza la
   duración en `tutorial/index.html`.

Las rutas y herramientas del montaje pueden cambiarse con `--recording`,
`--work-dir`, `--output`, `--assets-dir`, `--ffmpeg` y `--ffprobe`. Consulta
`python3 scripts/tutorial/assemble.py --help`. El montaje limita FFmpeg a dos
hilos de forma predeterminada (`--threads`).

Si cambias la salida de audio, la grabación utiliza las rutas guardadas en
`tutorial/guion.json`; sus propios videos y `recording.json` siguen en
`/workspace/tutorial-mi-balance`. `--speed` modifica la velocidad neuronal y
`--threads` limita el trabajo en CPU. Una voz o versión distinta puede producir
diferencias de duración. Para una grabación nueva, genera audio antes de
capturar y montar. Consulta las opciones con `prepare_audio.py --help`.

## Cambiar solo la voz de un video existente

Si el guion y las acciones no cambian, puedes conservar la grabación y los
subtítulos existentes. Genera la voz en otra carpeta con `--output-dir`,
conserva `recording.json` original y ajusta cada nuevo WAV a la duración
`speechDuration` original con un cambio moderado de velocidad mediante
`ffmpeg -af atempo=FACTOR`. El factor es la duración nueva dividida por la
duración original. Comprueba que el ajuste resulte natural; si supera el 25 %
o la explicación ya no coincide con la acción, vuelve a grabar esa escena.

Coloca los WAV ajustados en los tiempos originales (inicio de escena más un
segundo) y sustituye únicamente la pista de audio, conservando el video con
`-c:v copy`. El comando siguiente realiza el ajuste y valida que la imagen
permanezca idéntica; rechaza cambios de velocidad mayores al 25 %:

```sh
PYTHONPATH=/workspace/tutorial-tools/python python3 scripts/tutorial/prepare_audio.py --output-dir /workspace/tutorial-mi-balance-neural
python3 scripts/tutorial/replace_audio.py --audio-dir /workspace/tutorial-mi-balance-neural
```

`tutorial/timeline.json` conserva los tiempos del video publicado; el montaje
completo los actualiza si se vuelve a grabar. El reemplazo escribe los WAV
ajustados y su informe en `/workspace/tutorial-mi-balance-neural/montaje`.
Así evitas recomprimir la imagen. La generación modifica
`tutorial/guion.json`: al terminar, sincroniza sus rutas y duraciones con los
WAV ajustados y con la cronología conservada. Revisa la sincronía y los
subtítulos por escena antes de publicar; la alineación sigue siendo aproximada
por bloques. No hace falta capturar de nuevo cuando esta revisión es correcta.

## Entrega y revisión

- Video: `downloads/tutorial-cliente.mp4`, H.264 1280×720 a 25 fps, AAC 96 kbit/s,
  audio normalizado y MP4 con inicio rápido.
- Página, portada y subtítulos: `tutorial/index.html`, `tutorial/portada.jpg` y
  `tutorial/subtitulos.vtt`. La página espera el MP4 con el nombre `video.mp4` en
  el mismo directorio al publicarse; copia el video allí en la distribución sin
  duplicarlo en el repositorio.
- Informe de montaje: `/workspace/tutorial-mi-balance/assembly.json`.

El despliegue `Publish web` copia el video y la página al subir a `main`.
Al sustituir el MP4, cambia también la versión `?v=...` en los enlaces de
`tutorial/index.html` para que los visitantes carguen la nueva voz.

La grabación ya lleva subtítulos integrados; no se queman de nuevo al montar.
El VTT opcional comparte los tiempos por bloques de la grabación. Estos tiempos
son aproximados dentro de cada frase, sin alineación palabra por palabra.
Revisa la voz y su sincronía al comienzo, en una escena intermedia y al final,
la legibilidad de las cifras, la vista móvil y el acceso de los enlaces públicos
antes de compartir. La vista móvil mostrada es la web; no es una grabación de
una APK. La prueba simulada no comprueba el servidor real ni reemplaza las
pruebas funcionales de cuentas.

## Sustituir la narración por una voz humana

Puedes grabar una toma por escena, convertirla a WAV mono de 16 bits/22050 Hz y
guardar los archivos con los nombres de las claves de `tutorial/guion.json`
(`intro.wav`, `login.wav`, etc.). Conserva el texto del guion y actualiza en ese
JSON `audio`, `speechDuration` y `duration` (duración del WAV más dos segundos)
antes de volver a capturar y montar. No ejecutes `prepare_audio.py` después de
poner tus grabaciones, porque las reemplazaría.
El texto de lectura está disponible en `tutorial/guion.txt` con títulos por
escena, listo para copiar en un editor o usar durante una grabación.

Para una edición sencilla en CapCut, importa el MP4, silencia su audio original,
graba o añade tu narración y ajusta los cortes a cada explicación. Si cambia la
duración de las frases, sustituye también los subtítulos: los del MP4 están
integrados en la imagen. Exporta a MP4 H.264 y revisa el resultado antes de
reemplazar el video publicado.
