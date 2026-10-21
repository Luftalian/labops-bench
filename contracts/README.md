# API契約 v0.1

キーと型の正本は[labops.schema.json](labops.schema.json)。JSON Schema Draft 2020-12の`$defs`にCatalog、Workflow、Task、DesignRequest、EvaluationResult、Eventを置く。rootは開発用Fixture bundleの検証用。実APIでは該当`$defs`を参照する。

## API案

```text
POST /v1/evaluations
Body: DesignRequest
Response: EvaluationResult
```

サーバーはtask_id/task_versionから固定Taskを取得し、Taskが参照するcatalog/workflowのversionも照合する。利用者から価格・duration・Hを受け取り上書きしない。Stage 2は別契約で追加し、Stage 1に任意座標を混入させない。

submission_idはSearch Run内の提出識別子。同じID/同じ入力の通信再試行には保存済みの同じ結果を返す。同じID/違う入力は409。同じ候補でも新IDなら新しい提出としてKへ加算する。run_idとKは呼び出し元ハーネスのサーバー側contextで保持する。HTTP実装時にrun contextの結び方を定義し、クライアントがKを増やせないようにする。

| 状況 | 応答案 |
|---|---|
| 型不正、未知のキー | HTTP 422、評価ハーネスには提出失敗として記録 |
| task/versionが見つからない | HTTP 404、候補提出履歴には記録 |
| 予算・設備・配置条件違反 | HTTP 200、status=invalid、valid=false、metrics=null |
| 正常計算 | HTTP 200、status=completed、valid=true |
| drain上限で未完了 | HTTP 200、status=truncated、valid=true、makespan=null |
| システム障害 | HTTP 5xx、status=error、原因を記録。同じsubmission_idで再試行 |

invalid/errorのeventsは空。無効構成を加工して勝手に有効化しない。errorは構成の実行可能性が判定できなかった場合も含み、invalidと区別して集計する。

fixture内のresult_origin=hand_calculated_fixtureはUI開発用。本番評価レスポンスはsimulationとし、評価ハーネスはfixtureをbenchmark集計に入れない。

## fixture

- [single-mix-valid.json](../fixtures/single-mix-valid.json)：1job、入口→装置1秒、処理10秒、出口まで1秒。手計算で12秒。
- [missing-device-invalid.json](../fixtures/missing-device-invalid.json)：構造は正しいが必要装置がない。
- [four-stage-input.json](../fixtures/four-stage-input.json)：4種の装置と10job。計算結果はまだ付けていない。

graphのedgeは無向。長さはcorridorの道のりで、端点の直線距離以上。接続性と長さは検証するが、一般のCAD衝突や通路幅をこのcheckerが証明するわけではない。

## 検証の範囲

`scripts/check_contracts.py`はschema、参照、費用、台数、直列工程、基本配置、graphの接続性、手計算resultの集計整合性を検証する。実シミュレータのdispatch、予約、batch、queueは未実装。A02で振る舞いを検証する。Python/TypeScript双方のモデルを作る場合も、このschemaとfixtureを共通テストに利用する。
