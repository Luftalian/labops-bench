"""Original lo-fi drum bed for the submission video, synthesised from sine waves and noise (no samples).

Usage: python scripts/make-lofi-bgm.py <out.wav> [seconds]
Needs numpy and scipy. 84 BPM boom-bap with swung hats, a soft electric-piano progression
(Dm9 - G13 - Cmaj9 - Am9), tape-style low-pass, light bit reduction and vinyl crackle.
The first two bars are hats and keys only, so the drums arrive after the title card.
"""
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 84
SWING = 0.58
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
rng = np.random.default_rng(20261022)


def decay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output="sos"), x)


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * np.cumsum(48 + 70 * np.exp(-t / 0.045)) / SR) * decay(n, 0.22)
    x += 0.12 * filt(rng.standard_normal(n), "lowpass", 1800) * decay(n, 0.006)
    return np.tanh(1.8 * x) / np.tanh(1.8)


def snare():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    body = 0.55 * np.sin(2 * np.pi * 185 * t) * decay(n, 0.06)
    noise = 0.8 * filt(rng.standard_normal(n), "bandpass", [1200, 5500]) * decay(n, 0.12)
    return body + noise


def hat(open_hat=False):
    n = int((0.28 if open_hat else 0.07) * SR)
    return 0.5 * filt(rng.standard_normal(n), "highpass", 7000) * decay(n, 0.1 if open_hat else 0.022)


def ep(freq, dur):
    """Electric-piano-like tone: decaying partials with a gentle tremolo."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t) * np.exp(-t / 0.35) + 0.1 * np.sin(6 * np.pi * freq * t) * np.exp(-t / 0.15)
    x *= np.minimum(1, t / 0.012) * np.exp(-t / 1.9) * (1 + 0.08 * np.sin(2 * np.pi * 4.2 * t))
    fade = min(n, int(0.08 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    return x


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


CHORDS = [  # rootless mid-range voicings + a soft root
    {"root": 38, "notes": [53, 57, 60, 64]},  # Dm9
    {"root": 43, "notes": [53, 57, 59, 64]},  # G13
    {"root": 48, "notes": [52, 55, 59, 62]},  # Cmaj9
    {"root": 45, "notes": [55, 59, 60, 64]},  # Am9
]


def main():
    out = sys.argv[1]
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 240.0
    n = int((dur + 4) * SR)
    drums, keys = np.zeros(n), np.zeros(n)

    def place(buf, x, t, gain):
        i = int(t * SR)
        if i >= n:
            return
        j = min(n, i + len(x))
        buf[i:j] += gain * x[: j - i]

    for b in range(int(dur / BAR) + 2):
        t0 = b * BAR
        kicks = [0, 7, 10] if b % 2 == 0 else [0, 3, 10]
        for s in range(16):
            t = t0 + s * STEP + (SWING - 0.5) * 2 * STEP * (s % 2)
            if b >= 2:
                if s in kicks:
                    place(drums, kick(), t, 0.95 if s == 0 else 0.72)
                if s in (4, 12):
                    place(drums, snare(), t + 0.012, 0.62 * (1 + 0.06 * rng.standard_normal()))
            if s % 2 == 0:
                place(drums, hat(), t, (0.5 if s % 4 == 0 else 0.34) * (1 + 0.12 * rng.standard_normal()))
            elif rng.random() < 0.22:
                place(drums, hat(), t, 0.16)
            if s == 14 and b % 4 == 3:
                place(drums, hat(True), t, 0.26)
        ch = CHORDS[b % 4]
        drift = 2 ** (rng.normal(0, 4) / 1200)  # a few cents of tape drift per bar
        for k, m in enumerate(ch["notes"]):
            place(keys, ep(mtof(m) * drift, BAR * 0.62), t0 + k * 0.012, 0.15)
            place(keys, ep(mtof(m) * drift, BAR * 0.3), t0 + 10 * STEP + k * 0.01, 0.07)
        place(keys, ep(mtof(ch["root"]) * drift, BAR * 0.9), t0, 0.14)

    drums = np.tanh(1.3 * filt(drums, "lowpass", 8500)) / np.tanh(1.3)
    keys = filt(keys, "lowpass", 3200)
    crackle = np.zeros(n)
    pops = rng.integers(0, n, int(dur * 7))
    crackle[pops] = rng.standard_normal(len(pops)) * 0.5
    crackle = filt(crackle, "bandpass", [900, 7000]) + 0.004 * filt(rng.standard_normal(n), "bandpass", [300, 6000])
    mix = drums + 0.95 * keys + 0.25 * crackle
    mix = filt(filt(mix, "highpass", 35), "lowpass", 10000)
    mix = np.round(mix / np.max(np.abs(mix)) * 0.9 * 2048) / 2048  # light 12-bit grit
    mix = mix[: int(dur * SR)]
    with wave.open(out, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f"wrote {out}: {dur:.1f} s at {BPM} BPM")


if __name__ == "__main__":
    main()
