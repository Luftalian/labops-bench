# Laboratory demonstration media

The six source clips accompany the submission video. They show recorded simulation or browser replay; each has its own role and timing.

| Clip | Content |
| --- | --- |
| 1 | Synthetic demonstration with two arms, eight equipment types and three AMRs |
| 2 | Large synthetic facility: near view followed by an AMR tracking view |
| 3 | Saved heuristic run of scenario 04; 15 seconds in 3D and 15 seconds in 2D |
| 4 | Actual benchmark UI: 20-second scroll, ten seconds of 2D playback and ten seconds of 3D playback |
| 5 | Saved GPT Luna scenario 11 decisions and edited summaries of public rationales |
| 6 | Saved Jev scenario 11 decisions and changes in job priorities |

Clips 1/2 are demonstrations, not comparative scores. Their truncated simulation prefix has no finite makespan. Clip 5's rationale is unverified model output; it is not hidden reasoning or a live token stream. Clip 6 displays differences between 17 recorded decisions. No additional inference is required for replay.

Device bars in clips 3–6 show occupancy from loading through processing/cooling and unloading, independent of labels. The GIF and synthetic clips retain their original rendering.

## Capture and timing

The UI clip was assembled from real browser screenshots with recorded scroll positions and simulation display times. It uses a 1280×720 CSS viewport, a sequence of five scroll captures, and 120 captures per replay mode retimed into ten seconds each. It is not a continuous native-1080p recording. UI playback speed and video editing speed are separate.

All six clips use 30 fps. Clip 4 lasts 40 seconds; the others last 30 seconds. Preview files use 1080p H.264; editing masters use ProRes 422 HQ, 10-bit 4:2:2, Rec.709. Clip 3 is rendered at 3840×2160. Source IDs, hashes and format checks are retained in HACKATHON_MEDIA_V3_EVIDENCE.json; large capture/video files are local build artifacts.

## Rebuild

```sh
npm run media:prepare
LABOPS_MEDIA_PORT=4185 npm run media:studio
# Open http://127.0.0.1:4185/ and export benchmark clips.
# Capture the actual benchmark UI into results/local/hackathon-media-v3/ui-capture-bars/.
npm run media:ui-tour
npm run media:encode
```

UI capture is a separate manual browser stage. compose-ui-tour.mjs consumes the saved captures and their JSON metadata. Encoding uses ffmpeg/ffprobe; image composition uses ImageMagick. Code and provenance are tracked; large intermediate files and videos are not included in a clone.
