"""Offline, batch-only Kokoro narration. No app/server integration or cloned voice."""
import json, time, os, pathlib, socket, argparse
parser = argparse.ArgumentParser()
parser.add_argument('--scenes', default='')
args = parser.parse_args()
selected = {int(s) for s in args.scenes.split(',') if s}
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
import numpy as np
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro
root = pathlib.Path(__file__).resolve().parent

def offline(*args, **kwargs):
    raise OSError('Network connections disabled during narration generation')
socket.create_connection = offline
socket.socket.connect = offline
start = time.monotonic()
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
session = ort.InferenceSession(str(root / 'models/kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
model = Kokoro.from_session(session, str(root / 'models/voices-v1.0.bin'))
print('Local model loaded', flush=True)
out = root / 'output'
out.mkdir(exist_ok=True)
report = {'engine': 'kokoro-onnx', 'model': 'Kokoro-82M v1.0 ONNX', 'execution': 'CPU; batch; two-core affinity; Python network connections disabled', 'voice': 'af_heart', 'sample_rate': 24000, 'auditions': [], 'segments': []}
if selected and (out / 'generation-report.json').exists():
    report = json.loads((out / 'generation-report.json').read_text())
previous_seconds = report.get('total_generation_seconds', 0) if selected else 0
audition = 'Welcome to Roster Studio. It helps an operations manager answer a simple question: do we have the right people covering every required service? When someone becomes unavailable, the app checks the impact and shows what needs attention, without silently relaxing the rules.'
for voice, lang in [] if selected else [('af_heart', 'en-us'), ('af_bella', 'en-us'), ('bm_george', 'en-gb')]:
    t = time.monotonic()
    audio, sr = model.create(audition, voice=voice, speed=1.0, lang=lang)
    sf.write(out / f'audition-{voice}.wav', audio, sr, subtype='PCM_16')
    report['auditions'].append({'voice': voice, 'seconds': len(audio) / sr, 'generation_seconds': time.monotonic() - t})
    print('Audition generated:', voice, flush=True)
for i, scene in enumerate(json.loads((root / 'segments.json').read_text()), 1):
    if selected and i not in selected:
        continue
    t = time.monotonic()
    audio, sr = model.create(scene['narration'], voice='af_heart', speed=1.0, lang='en-us')
    assert sr == 24000 and len(audio) > sr and np.isfinite(audio).all()
    sf.write(out / f'scene-{i:02}.wav', audio, sr, subtype='PCM_16')
    item = {'scene': i, 'seconds': len(audio) / sr, 'generation_seconds': time.monotonic() - t, 'window_seconds': scene['end'] - scene['start'], 'peak': float(np.max(np.abs(audio))), 'rms': float(np.sqrt(np.mean(audio ** 2)))}
    report['segments'] = [s for s in report['segments'] if s['scene'] != i]
    report['segments'].append(item)
    print('Scene generated:', i, 'seconds:', round(item['seconds'], 2), flush=True)
report['total_generation_seconds'] = previous_seconds + time.monotonic() - start
report['segments'].sort(key=lambda s: s['scene'])
(out / 'generation-report.json').write_text(json.dumps(report, indent=2) + '\n')
print('GENERATION_COMPLETE', flush=True)
