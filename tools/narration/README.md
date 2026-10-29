# Offline CPU narration

This optional batch tool is independent of the Next.js app. It uses preset Kokoro voices, not a clone of the applicant. The actual VM run used Python 3.13, Kokoro-ONNX 0.6.1, the CPUExecutionProvider, two intra-op threads, one inter-op thread, sequential execution, two-core affinity and lower priority. Python network connects are disabled during generation, after local model/voice assets are downloaded. No TTS server or public endpoint is installed.

## Reproduce

On Linux, create a separate environment in this directory:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
mkdir -p models output
curl -fL https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx -o models/kokoro-v1.0.onnx
curl -fL https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin -o models/voices-v1.0.bin
sha256sum -c model-SHA256SUMS.txt
taskset -c 0,1 nice -n 10 .venv/bin/python generate.py
# Optional regeneration after shortening a passage:
.venv/bin/python generate.py --scenes 14,15
# FFmpeg must be installed for mixing; NumPy comes from the isolated lockfile.
.venv/bin/python mix.py
ffmpeg -y -i ../../public/walkthrough.mp4 -i narration-aligned.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k -ar 48000 \
  -af loudnorm=I=-16:TP=-1.5:LRA=7 -t 236.2 -movflags +faststart \
  ../../public/walkthrough-narrated.mp4
```

Adjust taskset to CPUs actually available on a different machine. On non-Linux systems omit taskset/nice. Exact dependency wheels and native libraries may differ by platform. No dependencies are added to package.json or the app's runtime.

## Actual outputs and review boundary

The15-scene first cut uses `af_heart` at natural speed 1.0. All scenes fit their own windows with no speedup, cutting or overlap. Two passages were shortened and regenerated rather than rushed. Three 17–18second auditions use `af_heart`, `af_bella` and `bm_george`. See `transcript.md` and `segments.json`; edit spoken text rather than feeding UI captions mechanically.

The finished 236.2second MP4 preserves the original video stream and adds normalized AAC narration. Technical checks cover nonempty/finite audio, bounded amplitude, scene timing, full decode, loudness and public browser playback. Naturalness and pronunciation are subjective: **no independent human listening review is claimed**. Listen to the alternatives and review technical names before submission.

The verified VM retains this environment at `~/apps/roster-tts/`; it does not modify the roster database. The model assets/venv are excluded from Git/ZIP.
