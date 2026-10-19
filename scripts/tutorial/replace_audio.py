#!/usr/bin/env python3
"""Replace narration while preserving the published video and caption timings."""

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import wave
from pathlib import Path

from assemble import probe, render_narration

ROOT = Path(__file__).resolve().parents[2]
RATE = 22050


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeline', type=Path, default=ROOT / 'tutorial/timeline.json')
    parser.add_argument('--audio-dir', type=Path, required=True, help='One WAV per chapter key.')
    parser.add_argument('--video', type=Path, default=ROOT / 'downloads/tutorial-cliente.mp4')
    parser.add_argument('--output', type=Path, help='Defaults to replacing --video after validation.')
    parser.add_argument('--work-dir', type=Path, default=Path('/workspace/tutorial-mi-balance-neural/montaje'))
    args = parser.parse_args()
    timing = json.loads(args.timeline.read_text(encoding='utf-8'))
    duration = float(timing['duration'])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid tutorial duration')
    scenes = timing['scenes']
    source = args.video.resolve()
    destination = (args.output or source).resolve()
    info = probe('ffprobe', source)
    if abs(float(info['format']['duration']) - duration) > 0.15:
        raise ValueError('The timeline does not match the input video')
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    report = []
    fitted_scenes = []
    previous_end = 0.0
    for scene in scenes:
        key = scene['key']
        if not re.fullmatch(r'[a-z0-9_]+', key):
            raise ValueError('Invalid chapter key')
        start, end, target = (float(scene[k]) for k in ('start', 'end', 'speechDuration'))
        if not all(math.isfinite(v) for v in (start, end, target)) or start < previous_end - 0.05 or target <= 0 or start + 1 + target > end + 0.05:
            raise ValueError(f'Invalid chapter timing: {key}')
        previous_end = end
        audio = args.audio_dir / f'{key}.wav'
        with wave.open(str(audio), 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
                raise ValueError(f'{audio} must be mono PCM16 at {RATE} Hz')
            measured = wav.getnframes() / RATE
        tempo = measured / target
        if not 0.75 <= tempo <= 1.25:
            raise ValueError(f'{key}: narration needs excessive speed adjustment ({tempo:.3f}); record it closer to {target:.2f}s')
        fitted = work / f'{key}.wav'
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(audio),
            '-af', f'atempo={tempo:.9f},apad', '-t', f'{target:.9f}',
            '-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s16le', str(fitted),
        ], check=True)
        fitted_scenes.append({**scene, 'audio': str(fitted)})
        report.append({'key': key, 'sourceSeconds': measured, 'publishedSeconds': target, 'tempo': tempo})
    narration = work / 'narracion.wav'
    render_narration(fitted_scenes, duration, work, narration)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.stem + '.new-voice.mp4')
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y',
        '-i', str(source), '-i', str(narration), '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-t', str(duration),
        '-af', 'loudnorm=I=-16:TP=-3:LRA=11,aresample=48000',
        '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '1',
        '-metadata', 'comment=Demostración ficticia. Voz neuronal en español latino, Piper es_MX-claude-high.',
        '-metadata:s:a:0', 'language=spa', '-movflags', '+faststart', str(temporary),
    ], check=True)
    result = probe('ffprobe', temporary)
    streams = result['streams']
    if abs(float(result['format']['duration']) - duration) > 0.15 or [s['codec_type'] for s in streams] != ['video', 'audio'] or streams[0]['codec_name'] != 'h264' or streams[1]['codec_name'] != 'aac':
        raise ValueError('Output failed duration or codec validation')
    def video_hash(file):
        return subprocess.check_output([
            'ffmpeg', '-v', 'error', '-i', str(file), '-map', '0:v:0',
            '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', '-'
        ], text=True).strip()
    if video_hash(source) != video_hash(temporary):
        raise ValueError('The video stream changed unexpectedly')
    temporary.replace(destination)
    summary = {'output': str(destination), 'duration': duration, 'videoPreserved': True, 'chapters': report,
               'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
    (work / 'replacement.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, wave.Error) as error:
        print(f'No se pudo sustituir la narración: {error}', file=sys.stderr)
        sys.exit(1)
