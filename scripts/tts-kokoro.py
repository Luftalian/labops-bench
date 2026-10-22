"""Generate narration sentences with Kokoro-82M (hexgrad/Kokoro-82M, Apache-2.0).

Called by scripts/build-submission-video.mjs with a jobs file:
  {"voice": "bm_george", "lang": "b", "speed": 1.0, "items": [{"id": "...", "text": "...", "out": "....wav"}]}
Each sentence is synthesised as one chunk; the G2P phonemes are printed so mispronunciations can be traced.
"""
import json
import os
import sys
import wave

import numpy as np
from kokoro import KPipeline


def main():
    jobs = json.load(open(sys.argv[1]))
    pipe = KPipeline(lang_code=jobs.get("lang", "b"), repo_id="hexgrad/Kokoro-82M", device="cpu")
    print(f"[tts] kokoro-82m voice={jobs['voice']}, {len(jobs['items'])} sentence(s)", flush=True)
    for item in jobs["items"]:
        audio, phonemes = [], []
        for r in pipe(item["text"], voice=jobs["voice"], speed=jobs.get("speed", 1.0), split_pattern=None):
            audio.append(r.audio.numpy())
            phonemes.append(r.phonemes)
        pcm = np.clip(np.concatenate(audio), -1, 1)
        tmp = item["out"] + ".tmp"
        with wave.open(tmp, "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(24000)
            f.writeframes((pcm * 32767).astype(np.int16).tobytes())
        os.replace(tmp, item["out"])
        print(f"[tts] {item['id']}: {len(pcm) / 24000:.1f} s  /{' '.join(phonemes)}/", flush=True)


if __name__ == "__main__":
    main()
