"""Align spoken scenes without cutting speech or changing the screen recording."""
import json, pathlib, subprocess
import numpy as np, wave

class PCM:

    @staticmethod
    def read(path, dtype=None):
        with wave.open(str(path), 'rb') as f:
            assert f.getsampwidth() == 2 and f.getnchannels() == 1
            return (np.frombuffer(f.readframes(f.getnframes()), dtype='<i2').astype(np.float32) / 32768, f.getframerate())

    @staticmethod
    def write(path, audio, sr, subtype=None):
        with wave.open(str(path), 'wb') as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(sr)
            f.writeframes((np.clip(audio, -1, 0.999969) * 32768).astype('<i2').tobytes())
sf = PCM
root = pathlib.Path(__file__).parent
scenes = json.loads((root / 'segments.json').read_text())
report = {'sample_rate': 24000, 'scenes': [], 'voice': 'af_heart', 'auditory_review': 'Not independently auditioned by a human; preset alternatives provided for user review.'}
out = root / 'output'
sr = 24000
total = 236.2
track = np.zeros(round(total * sr), np.float32)
for i, s in enumerate(scenes, 1):
    p = out / f'scene-{i:02}.wav'
    audio, rate = sf.read(p, dtype='float32')
    assert rate == sr and audio.ndim == 1 and np.isfinite(audio).all()
    peak = float(np.max(np.abs(audio)))
    saturation = float(np.mean(np.abs(audio) >= 0.9999))
    assert saturation < 0.0001, f'Clipping needs regeneration: {i}'
    available = s['end'] - s['start'] - 1.5
    duration = len(audio) / sr
    ratio = max(1.0, duration / available)
    if ratio > 1.12:
        raise ValueError(f'Scene {i} needs shorter script, not aggressive speedup: {ratio}')
    if ratio > 1:
        fitted = out / f'fitted-{i:02}.wav'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(p), '-af', f'atempo={ratio:.6f}', '-ar', str(sr), str(fitted)], check=True)
        audio, rate = sf.read(fitted, dtype='float32')
    fade = min(240, len(audio) // 2)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    start = s['start'] + 0.7
    end = start + len(audio) / sr
    assert end <= s['end'] - 0.4, (i, end, s['end'])
    offset = round(start * sr)
    track[offset:offset + len(audio)] = audio
    report['scenes'].append({'scene': i, 'start': start, 'end': end, 'original_seconds': duration, 'tempo_factor': ratio, 'peak': peak, 'saturated_sample_fraction': saturation})
sf.write(root / 'narration-aligned.wav', track, sr, subtype='PCM_16')
report['duration_seconds'] = len(track) / sr
report['all_speech_inside_own_scene'] = True
(root / 'alignment-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('Aligned all15 narrated scenes with no cutting or overlap.')
