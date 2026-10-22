# API契約 v0.1

キーと型の正本は[labops.schema.json](labops-v0.1.schema.json)。JSON Schema Draft 2020-12の`$defs`にCatalog、Workflow、Task、DesignRequest、EvaluationResult、Eventを置く。rootは開発用Fixture bundleの検証用。実APIでは該当`$defs`を参照する。

## 実装済みAPI

```text
POST /v1/evaluations
Body: DesignRequest
Response: EvaluationResult
```

サーバーはtask_id/task_versionから固定Taskを取得し、Taskが参照するcatalog/workflowのversionも照合する。利用者から価格・duration・Hを受け取り上書きしない。Stage 2は別契約で追加し、Stage 1に任意座標を混入させない。

submission_idはSearch Run内の提出識別子。同じID/同じ入力の通信再試行には保存済みの同じ結果を返す。同じID/違う入力は409。同じ候補でも新IDなら新しい提出としてKへ加算する。run_idとKは呼び出し元ハーネスのサーバー側contextで保持する。`POST /v1/runs`で固定Taskに結び付けたrunを作成し、`X-LabOps-Run-Id`ヘッダで提出を所属させる。K=20はサーバー設定であり、クライアントの上書きキーは拒否する。

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

## Run contextと起動

`npm start`でローカルHTTPを起動する。`GET /v1/tasks`は公開catalog/workflow/taskを返し、手計算の期待レスポンスは返さない。現在の2課題は既存synthetic開発fixtureに由来する。

```text
POST /v1/runs
{"task_id":"four-stage-dev","task_version":"1","method":"manual","search_seed":17}
# method: manual / random / greedy / ai。call_limitは入力できない。

POST /v1/evaluations
X-LabOps-Run-Id: <server-issued run_id>
Body: DesignRequest

GET /v1/runs/:run_id
POST /v1/runs/:run_id/search  # 新しいRandom/Greedy runのみ
```

上限到達後の新IDは429。同一ID/同一入力の再送は上限到達後や再起動後も保存済み結果を返す。システム障害後の同一ID再試行は再計上しない。同一ID/異なる入力は409として記録する。候補のJSONが読めない場合もrunに所属できれば失敗提出として計上する。run設定不正・存在しないrunは候補評価の前段で拒否する。

入力hashと全提出・結果・失敗は`results/local/stage1/<run_id>/`のmanifestとJSONL journalへ保存する。これはローカルの信頼された実験ハーネスで、認証済みマルチユーザーサービスやOS隔離されたcontestant環境ではない。

PoC追加モードの`/api/v4/`は元の別プロトコルであり、上記契約の別名ではない。

## fixture

- [single-mix-valid.json](../../fixtures/single-mix-valid.json)：1job、入口→装置1秒、処理10秒、出口まで1秒。手計算で12秒。
- [missing-device-invalid.json](../../fixtures/missing-device-invalid.json)：構造は正しいが必要装置がない。
- [four-stage-input.json](../../fixtures/four-stage-input.json)：4種の装置と10job。計算結果はまだ付けていない。

graphのedgeは無向。長さはcorridorの道のりで、端点の直線距離以上。接続性と長さは検証するが、一般のCAD衝突や通路幅をこのcheckerが証明するわけではない。

## 検証の範囲

`scripts/check_contracts.py`はschema、参照、費用、台数、直列工程、基本配置、graphの接続性、手計算resultの集計整合性を検証する。Stage 1のdispatch、予約、queue、単試料policyは`tests/test_stage1.py`で別途検証する。batch_capacity>1は引き続き未対応として拒否する。Python/TypeScript双方のモデルを作る場合も、このschemaとfixtureを共通テストに利用する。
