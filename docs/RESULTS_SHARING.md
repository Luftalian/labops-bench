# View and share recorded results

Clone the public repository and run:

```sh
npm run view:results
```

Open http://127.0.0.1:4181/. Node.js 18.16+ is sufficient; Python, dependency installation, API keys and model calls are unnecessary.

For a portable distribution, run npm run build:results. Share dist/benchmark-ui, then run node serve.mjs inside that directory. GitHub Actions also produces a labopsbench-results-ui artifact.

The bundle includes 14 scenarios, 50 selected recordings, 2D/3D replay and source/license notices. It reads stored scores and decisions. Full local experiment journals and newly generated runs are not part of this selected recording distribution.
