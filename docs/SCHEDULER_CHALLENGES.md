# 配置・処理順・搬出入の判断を比較する

## 前回の初期配置が同じだった理由

保存された最初の `initial_design` を照合すると、元の10課題すべてでheuristic・Luna・Jevの台数、機器位置、アーム位置、AMR数が完全に一致していた。これは前回時点の観測である。現在の選択結果の監査は `scripts/build-lemat-report.mjs` で再生成する [SCHEDULER_INITIAL_LAYOUT_AUDIT.json](SCHEDULER_INITIAL_LAYOUT_AUDIT.json)。同じ完了時間だけから配置一致を推測したわけではない。

当時は3候補（上限台数を部屋全体へ均等配置、同じ台数で機器順を反転、半分の台数）の選択に限定していた。多くの課題では上限台数が自然な選択で、均等配置以外の自由度もほぼなかった。モデルが自由に座標を設計した比較ではない。前回の30試行はこの制限付きの比較として保存し、新課題の結果と区別する。priorityは別に判断しており、初期配置が一致しても完了時間が必ず一致するわけではない。

## 追加課題（11〜14）

| ID | 狙い | 条件・工夫する余地 |
|---|---|---|
| 11-priority-tail | 順番による差 | 7×5m、撹拌・液体操作・oven各1台、3アーム、1AMR。先に並んだ単一撹拌job6件と、下流工程を持つHAp workflow6件。下流装置を早く立ち上げて並行処理する。配置固定のFIFO/下流優先も別途比較。 |
| 12-overfull-inventory | 置き切れない装置 | 4×3.4m、4種類各9台の計36台を固定保有。装置本体だけで36×0.72×0.58=15.0336m²あり、床面積13.6m²を超える。室内は最大2台、外部待機最大35台、アーム2・AMR1。1〜2台の種類・重複台数を選んで交換。 |
| 13-lookahead-exchange | 時間差jobと交換時期 | 4×3.4m、4種類各2台固定保有、室内最大2台、外部待機最大7台。t=0から撹拌、1800秒から分離、3600秒から長い超音波処理、5400秒から短い液体操作。将来需要、長い処理、交換コストの競合。 |
| 14-layout-distance | 空間の使い方 | 24×16m、液体操作4台・分離4台、アーム8・AMR1、48job。部屋全体に広げる／入口近くへ集める／機器割当を反転／半分の台数から選ぶ。広い部屋だから全域に配置する必要はない。 |

元のLeMat公開注釈から抽出済みの操作・時間は変更していない。複数の材料由来jobを同じ施設へ投入する構成、到着時刻、機器寸法、搬送・取り扱い時間はベンチマークの合成条件。実機検証・化学的互換性の保証ではない。11は抽出されたHAp workflow、12〜14の外部搬出入部分は独立した単位操作jobを使う。

**搬出入の実装範囲**：選んだ機器のID・model・保有台数は固定。drain中は新規入場を止め、入場済みjob全体と予約・AMR帰還を終えてから交換する。切断、ドアまでの直線移動、外部取り扱い、搬入、再接続・校正を時間へ加算する。既存jobを途中停止して、未設置の次工程のために試料を外へ保管する実装ではない。全工程に必要な装置が同時に揃わない多段jobは入場できず、判断上限後に進行手段がなければ `scheduler_deadlock`、makespanはnullになる。これを短い成績に置き換えない。

12の全36台を一度に床へ置けないことは本体面積の下限から分かる。一方、一般のlayout候補の探索失敗は物理的不可能性の証明ではない。最大2台という室内bay制約も別に明示する。

## 共通の入出力と変換層

```text
同じ公開 SchedulerObservation
        ↓ decisionProblem（公開候補・同じ全残job/工程/予約/装置）
  ┌────────────┬─────────────────┬─────────────────┐
  │ルール/探索  │Luna JSON adapter│Jev typed adapter│
  │任意のpolicy │構造化回答を読む  │Choice / Scoreへ変換│
  └────────────┴─────────────────┴─────────────────┘
        ↓ compilePolicyAnswer
共通 SchedulerDecision（initial_design / priorities / reconfiguration）
        ↓ schema・台数・到達・衝突・経路・掃引の検証
同じエンジン → SchedulerReceipt / 次のObservation / 保存result
```

- エンジンはprovider名で実行や採点を変えない。主指標は全job完了時間。応答中はsimulation clockを止め、推論wall time・支出を別記録。
- `agent/policy-runtime.mjs` の `decisionProblem()` が公開情報を一つに揃える。ルールもLunaもJevも同じproblemを受ける。開発skills、他方式の結果、非公開スコアは渡さない。
- `policyController(policy)` に新しいルールや最適化アルゴリズムを接続できる。返り値は候補ID＋全job priority、または任意座標を含むcanonical `SchedulerDecision`。後者もエンジンで同じ検証を受ける。
- 今回の5方式比較は**公開候補を選択する同一の制限付きtrack**。新課題の候補は幾何検査のみ実施し、予測成績やロールアウトを付けない。自由座標のアルゴリズムをこの成績へ混ぜない。自由配置trackでは候補選択に限定されるJevとの表現力差も明記する必要がある。
- Lunaは候補IDと0〜1000のpriorityをJSONで返す。Jevは同じproblemをstateとし、配置Choice・job別0〜4のScoreから `round(score / 4 * 1000)` へ変換する。最終的なengine入出力は共通だが、priorityの分解能・推論方式は異なる。
- `SchedulerContext` に配置policy・保有inventory policy・初期buffer容量を追加公開。型の追加はoptionalで、旧fixtureと保存結果は互換性を維持。新課題は `dense-cell-candidates-v2`、固定保有は `fixed-owned-v1`。

ルールは単純である必要がない。たとえば探索・数理最適化・MPCを実装してよい。シミュレーションを探索に使う方式を追加する場合は、内部評価回数・計算時間も探索予算として明示し、他方式と同じ情報・同じ予算で比較する。今回の候補生成とルールは隠れたシミュレーションを行わない。

## 今回のルール

- **FIFO**：到着時刻→job ID。通常の課題はspread配置、外部待機は先に待っている種類を優先して2bayへ配置。将来需要を見ない。
- **Capacity + longest remaining work**：通常課題はspread配置。到着済みを優先し、残り処理時間の合計が大きいjobから処理。外部待機は先のcohortから処理する。
- **Bottleneck / travel + downstream-first**：機器ごとの残り処理負荷・移動距離のproxyで配置を選ぶ。外部待機は直近の将来需要も含む負荷圧と交換コストを使う。jobは下流工程の残り時間が大きいものを優先し、他装置の立ち上がりを早める。固定ルールであり、大域最適や最強baselineではない。

LLMの勝ちを合格条件にはしない。差が出ることは、何を判断した結果かを確認するためであり、LLMが良い成績になることを保証するものではない。

## より詰めた配置

従来は部屋寸法を均等割りするため、大きな部屋で不要な間隔が生まれていた。新しい `packedCellLayout()` は装置とアームの相対位置を維持し、入口近くにセルをまとめる。既定pitchは列1.2m・行2.6m。これは変更可能な**配置提案の間隔**で、装置本体や通行幅を小さくする係数ではない。

`/scheduler/` のInitial layout、Column pitch、Row pitch、Generate tight layoutで変更できる。`POST /scheduler/api/packing` はTask・選択台数・pitchを受け、検証済みのDesignRequestを返す。装置ごと1アームの提案で、選択台数から必要アーム数を明示する。台数制約や幾何に反すれば422と理由を返し、黙って台数を減らさない。staging課題は公開のactive-model候補またはcanonical JSONを使う。

本体間3cm、アームbase、入出力のservice領域、buffer、到達範囲、半径0.22mのAMRと経路gridを維持。関節空間での衝突や実際の保守・避難動線の認証ではない。

## 再現

```sh
LABOPS_RULE_POLICY=fifo node scripts/run-lemat-sdl.mjs 11- 12- 13- 14-
node scripts/run-lemat-sdl.mjs 11- 12- 13- 14-
LABOPS_RULE_POLICY=algorithm-advanced node scripts/run-lemat-sdl.mjs 11- 12- 13- 14-
node scripts/run-scheduler-ablations.mjs
# cumulative Jev ledger is retained; same authorized USD 3 cap
LABOPS_JEV_ENV_FILE=/path/to/.env node scripts/run-lemat-model.mjs jev 11- 12- 13- 14-
# isolated authorized Luna contestant reads only this public inbox
LABOPS_LUNA_INBOX=/private/tmp/labops-luna-challenges-inbox node scripts/run-lemat-model.mjs luna 11- 12- 13- 14-
node scripts/build-lemat-report.mjs
node scripts/verify-lemat-replay.mjs results/lemat-sdl/<run>
npm run check
```

再実行時は空の専用Luna inboxを使う（古い回答を新規推論に使わない）。結果は [SCHEDULER_CHALLENGES_RESULTS.md](SCHEDULER_CHALLENGES_RESULTS.md)。順序と配置の2×2比較、同一hashの照合、失敗を含むrun inventoryを生成する。各1試行であり、モデルの一般的な優劣・統計的有意差は結論しない。

## 判断理由と実際の実行の区別

モデルが返すreasonは未検証の説明で、engineの事実とは区別する。たとえば今回のLuna・課題12の初期理由には「2slotで4試料を同時処理できる」との記述があったが、このschedulerのdispatchは装置ごと1工程ずつで、実際のprocess peakは2だった。raw回答は修正せず保存し、画面では `Policy rationale (unverified)` と表示する。比較の時間・台数・同時数はreasonの数値ではなくengine eventから集計する。一般のcatalog上限とこのdispatch policyの有効並列数は同じとは限らない。

`node scripts/check-staging-checkpoint.mjs` はこの境界を確認するsoftware診断。HAp多段job1件に必要な3種類のうち2種類だけを室内へ置いて維持すると、幾何的には受理されるがjobは入場できず、判断上限後は `scheduler_deadlock / makespan_s=null / completed_jobs=0` となることを確認した。3種類のどの2種類を選んでも全工程のrouteは揃わない。現在の交換課題が単位操作を使う理由であり、途中試料の外部checkpointは今後の別機能になる。診断の入力・判断・結果は `results/local/validation/scheduler-challenges/whole-job-staging-diagnostic.json`。

## 全16課題の更新

追加4課題の既存20試行を保持し、元10課題と既存synthetic scheduler 2課題を全5方式で新規実行する。表示は全16件が既定で、synthetic課題を明示する。採用時刻・保持runを固定する`benchmark/scheduler-refresh.json`と現在のTask/config hashで旧結果へのfallbackを防ぐ。[更新方法](LEMAT_SDL_BENCHMARK.md#16課題の最新比較)、[全体結果](LEMAT_SDL_RESULTS.md)、[更新検証](SCHEDULER_REFRESH_VALIDATION.json)を参照。以前の`SCHEDULER_CHALLENGES_VALIDATION.json`は前回の記録である。
