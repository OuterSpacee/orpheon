# The listener for tools/voice-judge.ts: transcribe each WAV in a manifest with Whisper and print
# what it heard, one JSON object per line. Runs offline on models already in the Hugging Face
# cache; it never downloads.
#
#   python tools/voice-judge.py out/judge/manifest.json [small.en]
import json
import os
import sys
import wave

import numpy

os.environ.setdefault("HF_HUB_OFFLINE", "1")

from faster_whisper import WhisperModel  # noqa: E402


def samples(path):
    """A 16 kHz mono 16-bit WAV as floats: what Whisper takes, without needing an audio decoder."""
    with wave.open(path, "rb") as f:
        assert f.getframerate() == 16000 and f.getnchannels() == 1 and f.getsampwidth() == 2, path
        return numpy.frombuffer(f.readframes(f.getnframes()), dtype=numpy.int16).astype(numpy.float32) / 32768.0


manifest = json.load(open(sys.argv[1], encoding="utf-8"))
name = sys.argv[2] if len(sys.argv) > 2 else "small.en"
model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True)
for item in manifest:
    language = item.get("lang", "en")
    segments, _ = model.transcribe(
        samples(item["file"]),
        language=None if name.endswith(".en") else language,
        beam_size=5,
        temperature=0.0,
        condition_on_previous_text=False,
        without_timestamps=True,
    )
    heard = " ".join(segment.text.strip() for segment in segments)
    sys.stdout.buffer.write((json.dumps({"file": item["file"], "heard": heard}, ensure_ascii=False) + "\n").encode("utf-8"))
    sys.stdout.flush()
