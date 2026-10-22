# LeMat由来 SDLスケジューリング課題 v1

部屋形状と、装置・アーム・AMRの台数上限を制約に、全jobの完了時間を最小化する14課題（元の10課題と追加の判断課題4件）。設定の正本は `benchmark/lemat-sdl/scenarios.json`、生成器は同ディレクトリの `suite.mjs`。実行結果は [LEMAT_SDL_RESULTS.md](LEMAT_SDL_RESULTS.md) に保存結果から生成する。

## データの範囲

今回使用したのは **LeMat-Synthの公開GitHub注釈データ**。Hugging Faceのゲート付きデータベース全体を取得したという意味ではない。[公式のデータアクセス説明](https://lematerial.github.io/lematerial-llm-synthesis/getting-started/dataset/) は両者を区別している。

PoCが取得済みだった原本を読み、SHA-256を照合して再利用した。upstream revisionは `e4bacbcbac084544ca68d48242336c2e36f6ee15`。採用元は3論文レコード、正規化した工程範囲は8件。元レコードはLLMによる文献抽出であり、原論文の独立した再レビューや実際の自律合成への適合確認は行っていない。

| 元レコード | 採用範囲 | 主な扱い |
|---|---|---|
| `8c37fd10addf6d79f84ec2d5f4a8e5c6d6ef676f` | hydroxyapatite、Cs3Bi2I9の抽出工程／単位操作 | 撹拌600秒・3600秒、遠心300秒は原抽出値。欠損時間は明示した仮定。真空オーブン乾燥を遠心機からovenへ修正 |
| `73c6aeebd5877d2eb17d4961577d98216d503e6f` | Ag合成の超音波・遠心工程 | 超音波5400秒、遠心1800秒。準備済み試料の操作として切り出す |
| `1706.00484` | SrTiO3試料のエッチング工程 | 120秒。Sample A/Bの別処理を直列に繋ぐ全工程版は採用しない |

`workflows.json` にURL、revision、原本hash、extraction/material index、JSON pointer、元の時間値と単位、採用／対象外の工程、装置mapping、仮定を保持する。単位操作jobを「材料合成全体の完了」と数えない。`ha-full` / `cbi-full` も「抽出に記載された全工程の直列スケジューリング近似」であり、実験成功を保証する完全なロボットレシピではない。独立した前駆体調製を直列化し、手作業を自動化できることや標準容器への適合は仮定する。

公開リポジトリには [Apache-2.0のLICENSE](https://github.com/LeMaterial/lematerial-llm-synthesis/blob/e4bacbcbac084544ca68d48242336c2e36f6ee15/LICENSE) があり、[原文を同梱](../licenses/LeMat-Synth-APACHE-2.0.txt)する。[帰属と加工表示](../benchmark/lemat-sdl/ATTRIBUTION.md)、[元論文・DOIと別の利用条件](SOURCES.md#主要ベンチマークの元論文)、[全レコード一覧](LEMAT_SOURCE_RECORDS.md)を保持する。原論文・図・ゲート付きデータ全体の再配布権へ拡張しない。rawはGit対象外で、再取得URL/hashを保存する。

## 元の10課題で確認すること

1. **単一装置**：撹拌600秒×24job、装置・アーム・AMR各1。優先度変更が物理的能力を超えて処理時間を縮めないこと。
2. **狭い部屋と搬出入**：4×3.4m、保有装置2台・室内1台・外部待機1台。撹拌8jobと遅れて来る遠心8jobを、装置モデルを変更せず処理する。
3. **多数アーム**：32×24m、撹拌装置32台・アーム32台・AMR8台、64job。工程の同時処理数とアーム動作の同時数を区別し、共有搬送の制約も観測する。v2では準備済み64試料を各アームの有限bufferへ事前配置し、32アームの同時load/unloadを検証する。事前配置の搬送はこの単位操作課題の開始前条件で、完了時間には含まない。従来の受付搬送で始めたv1は別versionとして保存し、混合集計しない。
4. **時間差到着**：48job、2種類の抽出workflow、600秒／900秒間隔で到着。最初から未来のjobと工程も公開する。
5. **需要の波**：撹拌・遠心・超音波の16jobずつが0／2400／4800秒に到着。
6. **長い工程との重なり**：12時間と仮定したovernight乾燥が続く間に短い撹拌jobが到着。原工程時間を高速化しない。
7. **搬送制約**：22×12m、装置8台に対してAMR1台。短い操作で移動・待ちの影響を検証。
8. **有限buffer**：24件の多段workflow、アーム当たり4slot。入場時の未来buffer credit予約を検証。
9. **小さい部屋**：9×7m。10番と同一の32job・到着時刻・台数上限。
10. **広い部屋**：24×16m。同じ仕事でも搬送距離と配置条件が変わる。広いほど常に速いとは仮定しない。

故障復旧、試料破損、化学収率、不確実な実処理時間、装置ごとの実測信頼性を含む網羅的な実機評価ではない。今回の事象は配置、搬出入、入場、有限buffer、需要変動、長短工程、搬送競合に限る。

## 設定できる値と残す制約

`Room / count settings` から幅・奥行き・モデル別台数上限・アーム／AMR上限を指定できる。元Taskは残して別IDのcustom Taskを作成・保存する。製品共通の幅60m／奥行40m、装置64台、アーム16台、AMR8台などの上限は廃止した。追加モードの設定フォームとparserの任意上限も除去した。

正の有限な部屋寸法、非負整数台数、Taskごとの台数制約、実際の配置干渉・到達・搬送経路は残す。大きな値が必ず配置可能・高速に計算可能という意味ではない。workerのwall time、判断回数、simulation cutoff等の計算制限は、物理的な装置台数の上限と区別する。旧0.1の履歴schemaは変更しない。

シナリオの `groups` で、workflow、件数、開始時刻、到着間隔を編集する。`equipment`・`arms`・`amrs` は所有できる台数上限。`buffer_slots` はアームごとの有限slot。部屋外待機を使わない課題では候補が選んだ装置は全て室内へ設置する。候補の台数を配置器が黙って減らすことはない。

外部待機課題では、選択した **保有台数** が固定で、`layout.devices` が室内、`layout.parked_devices` が外部待機を表す。現在のdraftの `installed_resources.equipment_counts` は選択した保有inventoryを報告するため、室内台数は必ず `layout.devices` を見る。これは固定設計モードからの追加仕様であり、固定設計結果と混ぜて順位を付けない。

## 搬出入のモデル

移動前に新規jobの入場を止め、入場済みjob・予約・AMR帰還を全て完了させる。装置モデルと所有IDは不変。モジュール交換ではない。室内台数、外部待機容量、最終配置、既存AMRの経路を検証する。アームの移設と機器搬出入は別判断にする。

北壁の開口部を明示し、固定x・yawの直線で搬出入できる機器だけを受理する。通過する装置の矩形が、他装置・アーム・buffer・障害物・AMR待機位置に当たらないことを確認する。搬出は順番に行い、空いた後で搬入する。室外の詳細なCADやロボットによる搬送はモデル化せず、1台当たり180秒の外部handling時間を仮定する。

共通の仮定は移動0.1m/s、機器の切離し60秒・再接続60秒・校正60秒。機器ごとの時間を合計して1チームの排他作業として完了時間へ加算する。通常の室内物理移設には既存の保守的swept-envelope検査を使う。これらは実測値や関節空間の安全証明ではない。

## 同一条件での実行

全方式で同一のTask、seed `20261022`、部屋、資源上限、処理program、buffer、搬送・移設モデルを使用。判断周期は1800simulation秒、session判断上限32回、応答上限300wall秒。判断中はsimulation clockを停止する。判断上限後も最後の優先度でエンジンは完了まで進む。計算打切りは365simulation日、未完了に有限scoreを付けない。

初期配置の探索空間は共通の公開候補3つ：最大台数のcell配置、同台数で機種のcell割当順を反転、各多台数装置を半分にしたcompact案。モデルは自由な座標生成器としては比較していない。通常の周期判断では配置保持、外部待機課題では対応する搬出入も選べる。全残jobの工程・依存関係・処理時間・必要装置・到着時刻・資源占有を提示する。隠れたscoreや他方式の成績、開発skillは渡さない。

Jevには同じ観測・候補からChoiceとjob別Scoreを依頼し、`round(score / 4 * 1000)` で優先度へ変換する。[Choice](https://docs.typesafe.ai/primitives/choice)、[Score](https://docs.typesafe.ai/primitives/score)、[公式API](https://docs.typesafe.ai/api/system-one)。`jev-1.14.0` を固定し、長文コンテキストを使用する。取得できたusageから文書化されたinput単価で見積もる。失敗時も保守的な予約額を残し、3ドルを超える呼出しは送らない。provider障害をヒューリスティックの結果へ置き換えない。

Lunaはユーザー指定のCodex枠・`gpt-6-luna`・medium。専用サブエージェントが各観測を新たに読み、判断JSONを返す。再生はfresh inferenceと分ける。Lunaの請求額・token数を取得できない場合は未取得とし、推測値を作らない。[Codex非対話実行の公式説明](https://developers.openai.com/codex/noninteractive)。このマシンではCLIがhelpでも137終了したため、CLIを正常実行できたとは扱わない。

## 再現コマンド

```sh
# 公開rawを取得し、既存のSHA-256と照合。トークン不要。
node scripts/fetch-lemat-sdl.mjs
node scripts/curate-lemat-sdl.mjs results/local/lemat-source

# ヒューリスティック、Jev。キー値を引数に書かない。
node scripts/run-lemat-sdl.mjs
LABOPS_JEV_ENV_FILE=/path/to/.env node scripts/run-lemat-model.mjs jev

# Lunaは専用Codex contestantが /private/tmp/labops-luna-sdl-inbox を読む。
# fresh observation -> choice/priorities JSON。自動生成したpolicyの代用は禁止。
node scripts/run-lemat-model.mjs luna

# 保存した判断を現在のエンジンで再生し、trace/jobs/layout/metricsを比較。
node scripts/verify-lemat-replay.mjs results/lemat-sdl/<run-directory>
node scripts/build-lemat-report.mjs

npm run check
npm run check:poc
npm run check:import
npm run check:poc:replay
```

同じモデル入力でもfresh inferenceの同一結果は保証しない。探索範囲内の1回ずつの試行であり、方式の一般的な優劣や大域最適性は結論できない。ソフトウェアの再生一致と実機科学的妥当性の確認は別である。

最終検証の記録は [LEMAT_SDL_VALIDATION.json](LEMAT_SDL_VALIDATION.json)、元の3方式×10課題と追加5方式×4課題の結果は [LEMAT_SDL_RESULTS.md](LEMAT_SDL_RESULTS.md)。比較表の各時間ボタンから、保存した判断・priority・搬出入・工程イベントを2D/3Dで再生できる: [ローカル比較画面](http://127.0.0.1:4180/benchmarks/)。

追加4課題と共通policy adapter、密な配置の設定、比較の限界は [SCHEDULER_CHALLENGES.md](SCHEDULER_CHALLENGES.md)。追加分の検証は [SCHEDULER_CHALLENGES_VALIDATION.json](SCHEDULER_CHALLENGES_VALIDATION.json) に保存する。元の検証JSONは前回時点の記録として保持する。
