# 判断課題の探索的な比較

生成: 2026-10-22T01:03:06.964Z。各条件1試行、単位はsimulation時間。改善率は保存結果から計算し、実機性能や一般的なモデル順位を意味しない。

| Scenario | Room (m) | Jobs | FIFO (h) | Reference (h) | Algorithm (h) | Luna (h) | Jev (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| 11-priority-tail v1 | 7 × 5 | 12 | 12.625 | 8.310 | 8.282 | 8.268 | 8.327 |
| 12-overfull-inventory v1 | 4 × 3.4 | 22 | 7.661 | 7.661 | 5.068 | 4.860 | 5.459 |
| 13-lookahead-exchange v1 | 4 × 3.4 | 39 | 7.467 | 7.467 | 6.598 | 5.909 | 7.346 |
| 14-layout-distance v1 | 24 × 16 | 48 | 1.366 | 1.354 | 0.683 | 0.724 | 0.683 |

## 配置を固定して順番だけ変えた比較

- spread-full: FIFO 12.625h → 下流工程を先に立ち上げる順番 8.310h（完了時間 34.18%減）。
- packed-full: FIFO 12.597h → 下流工程を先に立ち上げる順番 8.277h（完了時間 34.30%減）。

各pairでTask hashと初期design hashの一致を検証。単なる配置差を順序の効果と取り違えないための2×2比較。

初期配置・台数の完全一致／相違は[監査記録](SCHEDULER_INITIAL_LAYOUT_AUDIT.json)、判断・priority・交換は[比較画面](http://127.0.0.1:4180/benchmarks/)で確認できる。

## Reproduction and evidence

- [Settings and source assumptions](LEMAT_SDL_BENCHMARK.md); [policy architecture and challenges](SCHEDULER_CHALLENGES.md).
- [Scenarios](../benchmark/lemat-sdl/scenarios.json), [source fields](../benchmark/lemat-sdl/workflows.json), [initial layout audit](SCHEDULER_INITIAL_LAYOUT_AUDIT.json).
- Raw immutable task/result/journal/provider input/output and source snapshots: results/lemat-sdl/<run>/<task>/. Large evidence files are Git-ignored, generated summaries remain reviewable.
- Selected runs: fifo = 2026-10-21T16-41-19.195Z-fifo-9838c9f6; heuristic = 2026-10-21T15-46-17.105Z-heuristic-6dfffc34, 2026-10-21T16-07-38.074Z-heuristic-6dbb5d6c, 2026-10-21T16-41-21.456Z-heuristic-fcee444d; algorithm-advanced = 2026-10-21T16-41-20.287Z-algorithm-advanced-f136f93d; gpt-6-luna-medium = 2026-10-21T15-43-22.737Z-gpt-6-luna-medium-4c5abf9d, 2026-10-21T16-09-37.772Z-gpt-6-luna-medium-24a0cb5a, 2026-10-22T00-54-02.898Z-gpt-6-luna-medium-227bf651; jev = 2026-10-21T15-46-21.130Z-jev-38a8a851, 2026-10-21T16-08-32.444Z-jev-8fe16bf8, 2026-10-22T00-54-26.159Z-jev-5460ce3c.
- Prior failures remain in report.json; incomplete results have no finite completion score. Initial Jev failures used overwritten same-epoch body files; missing per-retry bodies are not claimed available.
