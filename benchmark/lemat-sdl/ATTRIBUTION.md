# LeMat由来workflowの帰属と加工

`workflows.json`はLeMat-Synth公開GitHub注釈の固定revision `e4bacbcbac084544ca68d48242336c2e36f6ee15`から選択・正規化した派生データ。LeMaterial / LeMat-Synth contributorsに帰属し、[Apache-2.0本文](../../licenses/LeMat-Synth-APACHE-2.0.txt)と[第三者表示](../../THIRD_PARTY_NOTICES.md)を伴う。原論文の著者・題名・DOI・別の利用条件は[出典文書](../../docs/SOURCES.md#主要ベンチマークの元論文)を参照。

本プロジェクトの変更は、工程窓の選択、時間の秒換算、機器へのmapping、欠損時間の仮定、独立工程の直列化、synthetic workload/部屋/資源条件の付加。元pointer、値、単位、除外理由と仮定はJSONに保持する。保存済み比較との同一性を保つため、この整備でJSONや保存成績は書き換えない。

14課題は3つの注釈レコードから8workflowを構成する。ゲート付きHF dataset全体や原論文を再配布するものではない。原論文の図・PDFや権利確認が終わっていない文章の自由な再配布を許す表示ではない。
