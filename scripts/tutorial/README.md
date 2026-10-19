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
- Python 3 (solo biblioteca estándar), FFmpeg y FFprobe con H.264/libx264 y AAC.
- eSpeak NG con voz `es-419`. `prepare_audio.py` prefiere `espeak-ng` disponible
  en `PATH`. Si no existe, utiliza el ejecutable y las bibliotecas de la
  instalación local en `/workspace/tutorial-tools/root`, con el cargador
  `/lib64/ld-linux-x86-64.so.2`. Puedes cambiar esa ubicación con `--tools-root`.
  Mantiene la voz `es-419`, velocidad 158, tono 44, amplitud 125 y WAV PCM mono
  de 16 bits a 22050 Hz.

## Grabación y montaje

1. `python3 scripts/tutorial/prepare_audio.py` genera los WAV y actualiza
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
`/workspace/tutorial-mi-balance`. Una versión distinta de eSpeak NG puede
producir pequeñas diferencias de voz o duración: regenera siempre el audio,
la captura y el montaje juntos.

## Entrega y revisión

- Video: `downloads/tutorial-cliente.mp4`, H.264 1280×720 a 25 fps, AAC 96 kbit/s,
  audio normalizado y MP4 con inicio rápido.
- Página, portada y subtítulos: `tutorial/index.html`, `tutorial/portada.jpg` y
  `tutorial/subtitulos.vtt`. La página espera el MP4 con el nombre `video.mp4` en
  el mismo directorio al publicarse; copia el video allí en la distribución sin
  duplicarlo en el repositorio.
- Informe de montaje: `/workspace/tutorial-mi-balance/assembly.json`.

La grabación ya lleva subtítulos integrados; no se queman de nuevo al montar.
El VTT opcional comparte los tiempos por bloques de la grabación. Estos tiempos
son aproximados dentro de cada frase, sin alineación palabra por palabra.
Revisa la voz y su sincronía al comienzo, en una escena intermedia y al final,
la legibilidad de las cifras, la vista móvil y el acceso de los enlaces públicos
antes de compartir. La vista móvil mostrada es la web; no es una grabación de
una APK. La prueba simulada no comprueba el servidor real ni reemplaza las
pruebas funcionales de cuentas.
