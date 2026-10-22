# API契約 v0.2

正本は`labops.schema.json`。正式評価は`/v2/`、旧予算/H評価は`/v1/`、動的PoCは`/api/v4/`の別契約。

## Taskと提出

`GET /v2/tasks`は公開catalog、workflow、Taskを返す。Taskはroomの幅/奥行き、`resource_limits.equipment`、arms/amrs上限、全job、seed、policy、計算打ち切りを固定する。価格・設備予算・採点Hはない。

```text
POST /v2/runs
{"task_id":"counts-room-14x10-dev","task_version":"1","method":"manual","search_seed":17}
# run_idとKはサーバーが保持。現在はmanual/ai contextのみで、推論は行わない。

POST /v2/evaluations
X-LabOps-Run-Id: <run_id>
Body: DesignRequest

GET /v2/runs/:run_id
GET /v2/catalog
```

DesignRequestは`schema_version="0.2"`、`submission_id`、`task_id`/`task_version`、全モデルを含む`equipment_counts`、`arm_count`、`amr_count`、Taskと同じ`simulation_seed`を必須とする。任意の`layout`はPoC形式のdevices/robotsを使い、指定台数との一致と幾何を検証する。Taskのroom、台数上限、処理時間、打ち切りを提出側が上書きするキーは受け付けない。

## 応答と採点

| 応答 | 意味 |
|---|---|
| 200 / completed | 全jobの最終アーム搬出まで完了。有限`metrics.makespan_s`を最小化 |
| 200 / truncated | Taskの計算打ち切り。makespan=null、順位対象外 |
| 200 / invalid | 台数上限・必要資源・提出layout等の違反。metrics=null |
| 200 / layout_search_failed | 自動配置が指定台数のまま配置できなかった。metrics=null、物理的不可能性の証明ではない |
| 200 / error | 固定executorが完了できない内部状態。metrics=null、順位対象外 |
| 422 | 型不正・未知キー・旧契約入力。失敗提出として計上 |
| 404 | 未知run、またはrunに結び付かないTask/version |
| 409 | 同一submission_idの入力衝突、または保存runのTask変更 |
| 429 | K到達後の新ID提出 |
| 5xx | worker/基盤障害。同一IDで再試行可能 |

`installed_resources`は実際に設置した全装置・アーム・AMR数。`events`と`replay`は同じPoCエンジンの記録で、描画用の架空アームを追加しない。無効・配置失敗・errorには成績を付けない。UIの再生時刻でmakespanを再計算しない。

同一ID/同一入力は再送・再起動後も保存結果を返す。同一候補でも新IDはKへ加算。失敗を含むmanifest/JSONLを`results/local/counts-v0.2/`に保存する。ローカルの信頼された開発ハーネスで、認証/OS隔離されたcontestantサービスではない。

## 次期ジョブスケジューラ契約（draft）

`labops.schema.json`の`SchedulerConfig / SchedulerObservation / SchedulerDecision / SchedulerReceipt / SchedulerSessionRequest / SchedulerResult`は別protocol `labops.scheduler.v0.2-draft`を定義する。初期台数/配置、全未完了jobのpriority、定期的な配置維持/物理移設を表す。装置/アームのID・台数と装置modelを維持し、module交換は扱わない。既存`/v2/evaluations`へ送れるactionを増やす変更ではない。動作と実装境界は[`docs/SCHEDULER_INTERFACE.md`](../docs/SCHEDULER_INTERFACE.md)を参照。

`fixtures/scheduler/exchange.json`は生成可能なsynthetic通信例。`scripts/check_scheduler_contracts.py`と`agent/scheduler_contract.py`はshapeと参照整合性だけを検証する。`backend/scheduler/`がgeometry/掃引検証・受理・実行・永続化とHTTP endpointを実装する。API一覧は`backend/scheduler/README.md`。provider注入adapterに加え、別CLI runnerでLuna（Codex枠）／Jev（3ドル上限）の公開候補比較を接続。初回/定期判断の対応、stale snapshot、jobの完全なpriority vector、台数上限・資源ID・機器model不変をチェックする。

## 旧版

0.1 schemaは`archive/labops-v0.1.schema.json`。旧fixture・Python固定policy・`/legacy/`は保存済み結果の意味とoracleを保持する。現在の正式順位へ混ぜない。動的PoCの録画は元source snapshotで再現する。

新課題の`Policies.placement="dense-cell-candidates-v2"`は密なセル配置やactive model setの公開候補track。任意の`Policies.inventory="fixed-owned-v1"`では選択equipment_countsがresource_limits.equipmentに完全一致し、外部待機も含む保有機器を減らせない。旧Taskでinventory未指定なら従来の上限選択。SchedulerContextの`placement_policy`/`inventory_policy`/`buffer_slots`はoptional追加。provider変換やpacking previewはcanonical Decisionの検証を迂回しない。
