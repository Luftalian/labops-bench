"""BGM candidate made with Stable Audio 3 Small-Music (stabilityai/stable-audio-3-small-music).

The model is gated: accept the Stability AI Community License (and the Gemma terms it redistributes)
on Hugging Face and log in with `hf auth login` before running. Runs in the stable-audio-3 repo's venv:
  results/local/tts/stable-audio-3/.venv/bin/python scripts/make-stable-audio-bgm.py <out.wav> <seconds> [--seed N]
The model generates at most 120 s, so longer tracks are extended by inpainting: each new window keeps the
last CONTEXT seconds of the track fixed and generates what follows, then joins with a short crossfade.
"""
import argparse
import os

import soundfile as sf
import torch
from stable_audio_3 import StableAudioModel

PROMPT = (
    "Lo-fi hip hop instrumental, simple dusty boom-bap drum loop, soft muted kick, crisp snare, swung hi-hats, "
    "warm Rhodes chords, vinyl crackle, mellow and unobtrusive background music, 84 BPM"
)
NEGATIVE = "vocals, singing, speech, lyrics, loud, aggressive, distorted, harsh"
MAX, CONTEXT, SEAM = 120.0, 12.0, 0.5


def load(device):
    try:
        return StableAudioModel.from_pretrained("small-music", device=device)
    except Exception as e:  # MPS kernels can be missing; CPU is supported for the small models.
        if device == "cpu":
            raise
        print(f"[sa3] {device or 'auto'} failed ({e}); using cpu", flush=True)
        return StableAudioModel.from_pretrained("small-music", device="cpu")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("seconds", type=float)
    ap.add_argument("--seed", type=int, default=84)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--prompt", default=PROMPT)
    a = ap.parse_args()
    model = load(os.environ.get("LABOPS_SA3_DEVICE"))
    sr = model.model.sample_rate
    gen = lambda **kw: model.generate(prompt=a.prompt, negative_prompt=NEGATIVE, steps=a.steps, **kw)[0].float().cpu()

    track = gen(duration=min(MAX, a.seconds), seed=a.seed)
    print(f"[sa3] window 1: {track.shape[-1] / sr:.1f} s", flush=True)
    k = 1
    while track.shape[-1] < a.seconds * sr:
        need = a.seconds - track.shape[-1] / sr
        win = min(MAX, CONTEXT + max(need, 20.0))
        ctx = track[:, -int(CONTEXT * sr):]
        src = torch.zeros(track.shape[0], int(win * sr))
        src[:, : ctx.shape[-1]] = ctx
        out = gen(duration=win, seed=a.seed + k, inpaint_audio=(sr, src), inpaint_mask_start_seconds=CONTEXT, inpaint_mask_end_seconds=win)
        x = int(SEAM * sr)
        tail = out[:, int(CONTEXT * sr) - x:]
        fade = torch.linspace(0, 1, x)
        track[:, -x:] = track[:, -x:] * (1 - fade) + tail[:, :x] * fade
        track = torch.cat([track, tail[:, x:]], dim=-1)
        k += 1
        print(f"[sa3] window {k}: track now {track.shape[-1] / sr:.1f} s", flush=True)

    track = track[:, : int(a.seconds * sr)]
    track = track / track.abs().max() * 0.9
    sf.write(a.out, track.T.numpy(), sr)
    print(f"[sa3] wrote {a.out}: {a.seconds:.1f} s, {track.shape[0]} ch, {sr} Hz", flush=True)


if __name__ == "__main__":
    main()
