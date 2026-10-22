# Submission video

The video combines [laboratory clips](HACKATHON_MEDIA_V3.md) with HTML motion graphics. The authoritative narration and script are frontend/submission-video/narration.json. Tracked deliverables include the thumbnail, English captions and timeline in media/submission-video/.

The recorded delivery is 3:52.8, 1920×1080, 30 fps, H.264/AAC. The MP4 and source clips are large local artifacts and are not included in Git. A clean clone therefore provides the script/build system and benchmark replay, not a downloadable completed MP4.

## Build

```sh
node --experimental-websocket scripts/build-submission-video.mjs
```

This requires Chrome, ffmpeg, source clips under results/local/hackathon-media-v3/mp4/ (or media/hackathon-media-v3/) and a configured Python speech environment. Output goes to results/local/submission-video/. Options include --preview, --thumbnail, --stills 8,44,107, --timeline-only and --remux.

The default narration uses Kokoro-82M (Apache-2.0), voice bm_george, with kokoro and soundfile installed in results/local/tts/kokoro-venv. LABOPS_KOKORO_VOICE changes the voice. Per-sentence recorded audio overrides can be placed in results/local/submission-video/narration-override/<sentence-id>.wav. The narration JSON provides pronunciation overrides separately from display text.

The included music generator scripts/make-lofi-bgm.py uses synthesized audio with numpy/scipy. A music.wav, music.mp3 or music.m4a in the output directory is mixed below narration with a final fade; LABOPS_MUSIC_VOLUME defaults to 0.2. --remux replaces audio without rebuilding frames when narration timing is unchanged.

## Evidence

Synthetic SDL introduction/scale clips are demonstrations. The resource-constraint clip is a saved heuristic run, not an AI-agent run. Comparisons use the archived times in [the paper evidence](submission-2026/evidence/benchmark-results.json). Each compared method/scenario has one selected trial. Public model rationales are unverified explanations.

The closing references to element, electricity and water accounting describe future directions, outside the present benchmark. Media sources and third-party terms are recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
