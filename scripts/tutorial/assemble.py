#!/usr/bin/env python3
"""Assemble the recorded client tutorial without calling external services."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SAMPLE_RATE = 22050
SAMPLE_WIDTH = 2
NARRATION_DELAY = 1.0


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def probe(tool: str, path: Path) -> dict:
    result = subprocess.run(
        [tool, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def resolve_path(value: str, base: Path) -> Path:
    candidate = Path(value).expanduser()
    return candidate.resolve() if candidate.is_absolute() else (base / candidate).resolve()


def load_recording(path: Path) -> tuple[dict, Path, list[dict], float]:
    if not path.is_file():
        raise ValueError(
            f"No existe {path}. Ejecuta capture.mjs y espera a que termine antes del montaje."
        )
    recording = json.loads(path.read_text(encoding="utf-8"))
    video = resolve_path(recording["videoPath"], path.parent)
    if not video.is_file():
        raise ValueError(f"No existe el video grabado: {video}")
    scenes = recording.get("timeline") or recording.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("La grabación debe contener una lista timeline no vacía.")
    previous_end = 0.0
    for scene in scenes:
        start, end = float(scene["start"]), float(scene["end"])
        if not math.isfinite(start) or not math.isfinite(end) or start < previous_end - 0.05 or end <= start:
            raise ValueError(f"Cronología inválida en {scene.get('key', 'escena')}")
        previous_end = end
    duration = float(recording.get("duration", previous_end))
    if not math.isfinite(duration) or duration < previous_end - 0.05:
        raise ValueError("La duración de la grabación no cubre todas las escenas.")
    return recording, video, scenes, duration


def render_narration(scenes: list[dict], duration: float, base: Path, output: Path) -> list[dict]:
    frames = math.ceil(duration * SAMPLE_RATE)
    pcm = bytearray(frames * SAMPLE_WIDTH)
    manifest = []
    previous_audio_end = 0.0
    for scene in scenes:
        audio_path = resolve_path(scene["audio"], base)
        with wave.open(str(audio_path), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (
                1, SAMPLE_WIDTH, SAMPLE_RATE, "NONE"
            ):
                raise ValueError(f"El audio debe ser PCM mono de 16 bits a 22050 Hz: {audio_path}")
            audio_frames = audio.getnframes()
            raw = audio.readframes(audio_frames)
        actual_duration = audio_frames / SAMPLE_RATE
        declared_duration = float(scene["speechDuration"])
        if not math.isfinite(declared_duration) or abs(actual_duration - declared_duration) > 0.08:
            raise ValueError(f"speechDuration no coincide con el WAV de {scene.get('key', audio_path.name)}")
        start = float(scene["start"]) + NARRATION_DELAY
        end = start + actual_duration
        if start < previous_audio_end - 0.02:
            raise ValueError("Las narraciones se solapan. Revisa las duraciones de las escenas.")
        if end > float(scene["end"]) + 0.05 or end > duration:
            raise ValueError(f"La escena {scene.get('key')} termina antes que su narración.")
        first_byte = round(start * SAMPLE_RATE) * SAMPLE_WIDTH
        pcm[first_byte:first_byte + len(raw)] = raw
        previous_audio_end = end
        manifest.append({"key": scene.get("key"), "audioStart": start, "audioEnd": end})
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as combined:
        combined.setnchannels(1)
        combined.setsampwidth(SAMPLE_WIDTH)
        combined.setframerate(SAMPLE_RATE)
        combined.writeframes(pcm)
    return manifest


def render_subtitles(scenes: list[dict], output: Path) -> int:
    lines = ["WEBVTT", "", "NOTE Subtítulos de narración sintética. Ejemplos con datos ficticios.", ""]
    count = 0
    for scene in scenes:
        chunks = scene.get("chunks")
        if not isinstance(chunks, list) or not chunks or not all(isinstance(item, str) for item in chunks):
            raise ValueError(f"Faltan los chunks de subtítulos en {scene.get('key')}")
        speech_start = float(scene["start"]) + NARRATION_DELAY
        chunk_duration = float(scene["speechDuration"]) / len(chunks)
        for index, text in enumerate(chunks):
            start = speech_start + index * chunk_duration
            end = speech_start + (index + 1) * chunk_duration
            count += 1
            # Escape text so words cannot accidentally create WebVTT markup.
            text = html.escape(" ".join(text.split()), quote=False)
            lines.extend([str(count), f"{timestamp(start)} --> {timestamp(end)}", text, ""])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return count


def update_page_duration(page: Path, seconds: float) -> str:
    total = round(seconds)
    minutes, remaining = divmod(total, 60)
    label = f"{minutes} minuto{'s' if minutes != 1 else ''} {remaining:02d} segundos"
    source = page.read_text(encoding="utf-8")
    pattern = r"<li>(?:Aproximadamente \d+ minutos|\d+ minutos?(?: \d+ segundos)?)</li>"
    updated, count = re.subn(pattern, f"<li>{label}</li>", source)
    if count != 1:
        raise ValueError("No se encontró una única etiqueta de duración en la página del tutorial.")
    page.write_text(updated, encoding="utf-8")
    return label


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recording", type=Path, default=Path("/workspace/tutorial-mi-balance/recording.json"))
    parser.add_argument("--output", type=Path, default=ROOT / "downloads/tutorial-cliente.mp4")
    parser.add_argument("--assets-dir", type=Path, default=ROOT / "tutorial")
    parser.add_argument("--work-dir", type=Path, help="Defaults to the recording.json directory.")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--crf", type=int, choices=range(22, 25), default=23)
    parser.add_argument("--threads", type=int, default=2)
    arguments = parser.parse_args()
    recording_path = arguments.recording.expanduser().resolve()
    _, video, scenes, duration = load_recording(recording_path)
    for tool in (arguments.ffmpeg, arguments.ffprobe):
        if shutil.which(tool) is None:
            raise ValueError(f"No se encontró la herramienta requerida: {tool}")
    if arguments.threads < 1:
        raise ValueError("--threads debe ser positivo.")
    work = (arguments.work_dir or recording_path.parent).resolve()
    assets = arguments.assets_dir.resolve()
    output = arguments.output.resolve()
    if video == output:
        raise ValueError("La salida no puede reemplazar la grabación original.")
    assets.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    narration = work / "narracion-completa.wav"
    audio_timeline = render_narration(scenes, duration, recording_path.parent, narration)
    subtitles = assets / "subtitulos.vtt"
    cue_count = render_subtitles(scenes, subtitles)
    video_info = probe(arguments.ffprobe, video)
    raw_duration = float(video_info["format"]["duration"])
    if raw_duration + 0.3 < duration:
        raise ValueError(f"Grabación incompleta: {raw_duration:.3f}s para una cronología de {duration:.3f}s.")
    scale = "scale=1280:720:force_original_aspect_ratio=decrease:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1"
    temporary = output.with_name(output.stem + ".partial.mp4")
    print(f"Montando {len(scenes)} escenas, {cue_count} subtítulos y {duration:.2f} segundos.", flush=True)
    run([
        arguments.ffmpeg, "-hide_banner", "-loglevel", "warning", "-y",
        "-i", str(video), "-i", str(narration),
        "-map", "0:v:0", "-map", "1:a:0", "-t", f"{duration:.6f}",
        "-vf", scale + ",fps=25,tpad=stop_mode=clone:stop_duration=0.3",
        "-c:v", "libx264", "-preset", "medium", "-crf", str(arguments.crf),
        "-threads", str(arguments.threads), "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709",
        "-color_primaries", "bt709", "-color_trc", "bt709",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
        "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "1",
        "-movflags", "+faststart", "-metadata", "title=Mi Balance · Tutorial para clientes",
        "-metadata", "comment=Demostración con datos ficticios. Narración sintética en español.",
        "-metadata:s:a:0", "language=spa", str(temporary),
    ])
    final_info = probe(arguments.ffprobe, temporary)
    video_streams = [stream for stream in final_info["streams"] if stream["codec_type"] == "video"]
    audio_streams = [stream for stream in final_info["streams"] if stream["codec_type"] == "audio"]
    if len(video_streams) != 1 or len(audio_streams) != 1:
        raise ValueError("La salida debe contener una pista de video y una de audio.")
    stream = video_streams[0]
    if (stream["codec_name"], stream["width"], stream["height"], stream["pix_fmt"], stream["avg_frame_rate"]) != (
        "h264", 1280, 720, "yuv420p", "25/1"
    ) or audio_streams[0]["codec_name"] != "aac":
        raise ValueError("La salida no cumple el formato de distribución previsto.")
    final_duration = float(final_info["format"]["duration"])
    if abs(final_duration - duration) > 0.15:
        raise ValueError("La duración final difiere de la cronología de grabación.")
    temporary.replace(output)
    timing_fields = ("key", "title", "narration", "start", "end", "speechDuration")
    (assets / "timeline.json").write_text(json.dumps({
        "duration": final_duration,
        "scenes": [{key: scene[key] for key in timing_fields} for scene in scenes],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    poster_time = min(float(scenes[0]["start"]) + 4.0, float(scenes[0]["end"]) - 0.2)
    run([
        arguments.ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{poster_time:.3f}", "-i", str(video),
        "-frames:v", "1", "-vf", scale, "-q:v", "3", str(assets / "portada.jpg"),
    ])
    duration_label = update_page_duration(assets / "index.html", final_duration)
    summary = {
        "output": str(output), "duration": final_duration,
        "displayDuration": duration_label, "bytes": output.stat().st_size,
        "video": {"codec": "h264", "width": 1280, "height": 720, "fps": 25},
        "audio": {"codec": "aac", "bitrate": "96k", "narrationPcmRate": SAMPLE_RATE},
        "subtitles": str(subtitles), "cues": cue_count, "audioTimeline": audio_timeline,
        "note": "Subtítulos ya integrados por capture.mjs. VTT opcional con tiempos por bloques.",
    }
    (work / "assembly.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, wave.Error) as error:
        print(f"No se pudo montar el tutorial: {error}", file=sys.stderr)
        sys.exit(1)
