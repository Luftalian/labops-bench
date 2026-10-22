"""Generate narration sentences with Chatterbox-Turbo (ResembleAI/chatterbox-turbo).

Called by scripts/build-submission-video.mjs with a jobs file:
  {"voice": null | "<reference.wav>", "seed": 7, "items": [{"id": "...", "text": "...", "out": "....wav"}]}
Uses the model's built-in voice unless a reference clip (> 5 s) is given. Each sentence is retried with
another seed when its length is implausible for the word count (a sign of truncation or babbling).
"""
import json
import os
import sys
import wave

import numpy as np
import torch
from chatterbox.tts_turbo import ChatterboxTurboTTS


def load_model():
    # CPU by default: on Apple MPS the HiFi-GAN vocoder hits an unsupported conv1d (> 65536 output channels).
    device = os.environ.get("LABOPS_TTS_DEVICE", "cpu")
    return ChatterboxTurboTTS.from_pretrained(device=device), device


def write_wav(path, wav, sr):
    pcm = np.clip(wav.squeeze().cpu().numpy(), -1, 1)
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes((pcm * 32767).astype(np.int16).tobytes())


def main():
    jobs = json.load(open(sys.argv[1]))
    model, device = load_model()
    print(f"[tts] chatterbox-turbo on {device}, {len(jobs['items'])} sentence(s)", flush=True)
    voice = jobs.get("voice") or None
    if voice:
        model.prepare_conditionals(voice)
    for item in jobs["items"]:
        words = len(item["text"].split())
        for attempt in range(4):
            torch.manual_seed(jobs.get("seed", 7) + attempt)
            wav = model.generate(item["text"], temperature=0.7)
            sec = wav.shape[-1] / model.sr
            if 0.2 <= sec / words <= 0.62:
                break
            print(f"[tts] {item['id']}: {sec:.1f} s for {words} words, retrying", flush=True)
        tmp = item["out"] + ".tmp"
        write_wav(tmp, wav, model.sr)
        os.replace(tmp, item["out"])
        print(f"[tts] {item['id']}: {sec:.1f} s", flush=True)


if __name__ == "__main__":
    main()
