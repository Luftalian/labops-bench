# データ・論文・CADの出典と利用条件

確認日：2026-10-22。LabOpsBenchで使うデータ、モデル、描画素材と利用範囲をまとめる。完全なライセンス本文と帰属・加工表示は[第三者表示](../THIRD_PARTY_NOTICES.md)から参照できる。文献抽出値、設計上の仮定、保存された比較結果、撮影用デモを区別する。

## 使用物の一覧

| 使用物 | 取得元・固定版 | 用途と利用条件 |
|---|---|---|
| Self-Building Labs | Bai et al., [arXiv:2610.23826v1](https://arxiv.org/abs/2610.23826v1) | ラボ構成・digital twin・実行という設計の参考文献。取得manifestとコードでSBLのデータ・CAD・コードの取り込みは確認していない。下記参照 |
| LeMat-Synth公開注釈 | [LeMaterial/lematerial-llm-synthesis](https://github.com/LeMaterial/lematerial-llm-synthesis/tree/e4bacbcbac084544ca68d48242336c2e36f6ee15)、`e4bacbcbac084544ca68d48242336c2e36f6ee15` | 抽出手順・時間をスケジューリング入力へ変換。upstreamはApache-2.0、[本文同梱](../licenses/LeMat-Synth-APACHE-2.0.txt)。原論文の条件は別 |
| xArm6のvisual STL 7個 | [メーカーのuf-gym](https://github.com/xArm-Developer/uf-gym/tree/5d93e0419193bfed8a7cefc7bbe9b045a650f049/urdf/xarm)、`5d93e0419193bfed8a7cefc7bbe9b045a650f049` | base、link1〜link6の3D表示。MIT、© 2020 Quentin Gallouédec / © 2024 UFACTORY Inc。[原文](../backend/poc/sim/physics/assets/xarm6/LICENSE)と未改変STLを保持 |
| Three.js、OrbitControls、STLLoader | [Three.js](https://github.com/mrdoob/three.js)。同梱版hashは[取込manifest](../backend/poc/IMPORT_MANIFEST.json) | 3D描画、カメラ、STL読込。MIT、© 2010–2026 three.js authors。[原文](../backend/poc/demo/vendor/LICENSE-three.txt)とmoduleヘッダを保持 |
| 装置・AMR・家具の形状 | プロジェクトのprocedural geometry | メーカーCADではない。寸法参照以外の形状・ポート・自動化能力は仮定 |
| 部屋・台数・到着job・搬送 | [scenarios](../benchmark/lemat-sdl/scenarios.json)、[suite生成器](../benchmark/lemat-sdl/suite.mjs)、catalog | プロジェクトで設計した比較条件。LeMatや実測SDLから得た条件ではない |
| GPT Luna / Jev | [方式・モデル・記録](LEMAT_SDL_BENCHMARK.md#同一条件での実行) | hosted serviceが候補・priorityを選ぶ。モデル重みは配布せず、保存出力の再生と新規推論を区別 |
| FFmpeg | [公式ライセンス説明](https://ffmpeg.org/legal.html) | 外部のローカル編集コマンド。実行ファイル・ライブラリは素材に同梱しない |

## Self-Building Labsとの関係

Jiaru Bai, Yuchi Zhao, Han Hao, Miroslav Bogdanovic, Yang Cao, Varinia Bernales, Alán Aspuru-Guzik. *Self-Building Labs*. [arXiv:2610.23826v1](https://arxiv.org/abs/2610.23826v1), 2026-10-16. [DOI: 10.48550/arXiv.2610.23826](https://doi.org/10.48550/arXiv.2610.23826)。[論文HTML](https://arxiv.org/html/2610.23826v1)の表示はCC BY 4.0。これは論文の許諾であり、別配布のデータ・コード・CADの許諾を一律に定めるものではない。

PoCではラボを構成して実行する方向性の参考にしており、[既存viewerのAbout](../backend/poc/demo/workshop/app.mjs)にもSBL-inspiredと比較・引用を記載している。今回点検した取得manifestとコードでは、SBL配布物由来のデータ、CAD、コード、学習済みskill、実験traceの取り込みは確認されていない。実際の入力値はLeMat注釈、アームmeshはuf-gym、装置寸法はメーカー資料という別の取得経路を持つ。

LabOpsBenchは施設規模の配置・台数・順序・搬送を評価する。SBLが扱う自律的なskill開発や実機観測による校正、論文のend-to-end実験を再現したとは主張しない。参考設計の引用と、データやソフトウェアを取り込んだ場合の帰属・許諾を区別する。

## LeMatからベンチマークまで

抽出toolboxの参考文献は、Magdalena Lederbauer et al., *LeMat-Synth: a multi-modal toolbox to curate broad synthesis procedure databases from scientific literature*, [arXiv:2510.26824v2](https://arxiv.org/abs/2510.26824v2), 2026-08-30改訂（初版2025-10-28）。これはLabOpsBenchの性能評価を報告した論文ではない。

取得経路は公開GitHubの`annotations/<record>/result.json`。[LeMat-Synth](https://huggingface.co/datasets/LeMaterial/LeMat-Synth)と[LeMat-Synth-Papers](https://huggingface.co/datasets/LeMaterial/LeMat-Synth-Papers)のゲート付きcorpus全体は取得していない。認証・条件は[公式Dataset Access](https://lematerial.github.io/lematerial-llm-synthesis/getting-started/dataset/)を参照。

```text
固定revisionの公開annotation（原本URL・SHA-256）
  → PoCの正規化手順（元index・単位・抽出model）
  → benchmark/lemat-sdl/workflows.json（3レコード、8workflow）
  → suite.mjs + scenarios.json（14課題、全方式に同じ条件）
  → 保存result / report（比較結果）
```

元JSON pointer、値・単位、採用・除外工程、欠損時間とmappingは[workflows.json](../benchmark/lemat-sdl/workflows.json)に保持。秒換算、工程窓の選択、独立調製の直列化、真空乾燥のoven割当、欠損時間の仮定はプロジェクトによる変更。単位操作完了を化学合成成功と数えない。

PoCの同梱範囲は14課題より広い。[レコード一覧](LEMAT_SOURCE_RECORDS.md)と[JSON inventory](../data/lemat-source-inventory.json)に全source ID、実際に保持した手順・工程数、採用workflow、原本hash、原論文の権利確認状態を記録する。全コレクションの原論文文章の再配布条件を確認済みとは扱わない。

## 主要ベンチマークの元論文

### HAとCs3Bi2I9

Kun Yang, Yachun Wang, Junhua Shen, Spencer M. Scott, Brian J. Riley, John D. Vienna, Jie Lian. *Cs3Bi2I9-hydroxyapatite composite waste forms for cesium and iodine immobilization*. Journal of Advanced Ceramics **11**, 712–728 (2022). [DOI: 10.1007/s40145-021-0565-z](https://doi.org/10.1007/s40145-021-0565-z)。

`8c37fd10addf6d79f84ec2d5f4a8e5c6d6ef676f`のHA/Cs3Bi2I9調製・複合体SPSの内容から対応を同定した。upstreamが明示したDOI対応表ではない。採用は`ha-mix`、`cbi-mix`、`cbi-separate`、`ha-full`、`cbi-full`。

© The Author(s) 2021。[出版社のRights and permissions](https://link.springer.com/article/10.1007/s40145-021-0565-z)は[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)を明記。帰属と上記の加工を表示し、図・PDFを同梱しない。

### 銀ナノ粒子

Mansoureh Tavan, Parichehr Hanachi, Mohammad Hossein Mirjalili, Abolfazl Dashtbani-Roozbehani. *Comparative assessment of the biological activity of the green synthesized silver nanoparticles and aqueous leaf extract of Perilla frutescens (L.)*. Scientific Reports **13**, 6391 (2023). [DOI: 10.1038/s41598-023-33625-x](https://doi.org/10.1038/s41598-023-33625-x)。

`73c6aeebd5877d2eb17d4961577d98216d503e6f`はPerilla/AgNO3、60°C・90分の超音波、25°C・9000 rpm・30分の遠心を照合して同定。採用は`ag-sonicate`、`ag-separate`。こちらもhash IDとDOIの対応は内容による照合。

© The Author(s) 2023。[著者所属機関の出版版](https://researchnow-admin.flinders.edu.au/ws/portalfiles/portal/150065240/Tavan_Comparative_P2023.pdf)最終ページは[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)を明記。操作窓を選択・秒換算し、自動化と搬送は仮定として付加した。

### SrTiO3のエッチング窓

Trevor A. Petach, Apurva Mehta, Michael F. Toney, David Goldhaber-Gordon. *Crystal truncation rods from miscut surfaces*. Physical Review B **95**, 184104 (2017). [arXiv:1706.00484](https://arxiv.org/abs/1706.00484)、[DOI: 10.1103/PhysRevB.95.184104](https://doi.org/10.1103/PhysRevB.95.184104)。

annotation IDとarXiv IDが直接一致。採用は`sto-etch`の単位操作窓のみ。Sample A/Bを全て直列化した全工程版は使わない。arXivの[non-exclusive distribution license](https://arxiv.org/licenses/nonexclusive-distrib/1.0/license.html)は、第三者による全文再配布の許諾ではない。抽出値・工程種・出典参照の利用と論文転載を区別し、原論文PDF・図は同梱しない。

書誌・照合根拠・確認URLの正本は[data/source-references.json](../data/source-references.json)。書誌や利用条件の確認は、抽出の全条件や実験可能性の科学的再検証を意味しない。

## 初期PoCと歴史的出典

初期サンプルの3論文IDは、[1409.1070](https://arxiv.org/abs/1409.1070)（*Improper Ferroelectricity in Helicoidal Antiferromagnet Cu3Nb2O8*）、[1605.04038](https://arxiv.org/abs/1605.04038)（*Controlling Kondo-like Scattering at the SrTiO3-based Interfaces*）、[2502.03121](https://arxiv.org/abs/2502.03121)（*Optical bound states in the continuum in subwavelength gratings made of an epitaxial van der Waals material*）。現在の14課題の3レコードとは別。その他の同梱annotationも[一覧](LEMAT_SOURCE_RECORDS.md)に含む。未確認IDへ書誌や許諾を推測で付けない。

歴史的PoCでは[xarm_ros](https://github.com/xArm-Developer/xarm_ros/tree/cf51617d98bc55a88d9aa735acfa43a0bbb8e425)の別のbase mesh（BSD形式）からfootprintを計算した。現在表示する7個のSTLはMIT版uf-gym由来。履歴の寸法計算と現在配布するCADを区別する。

## 寸法・装置モデルと仮定

- 炉の寸法参照：[Carbolite ELF datasheet](https://www.carbolite.com/files/450755/product-data-sheet-elf.pdf)。元PoCの原本SHA-256は`08d8e487a5664eb375b4dffaa3df925d22f360a7b485cde9cb581359f1295424`。寸法参照であり、炉CADやPDFの再配布許諾ではない。
- 撹拌機の寸法参照：[IKA RCT basic technical data](https://www.ika.com/en/Products-LabEq/Magnetic-Stirrers-pg188/RCT-basic-25008259/Technical-Data-cptd.html)。元catalogのgeometry欄にも参照を保持。
- アームにはメーカーSTLと[catalog](../backend/poc/sim/v2/data/catalog.json)の到達・時間近似を使用する。実機の安全証明ではない。
- 他の装置body、AMR、ポート、buffer、速度、搬出入・再接続・校正時間、部屋と到着条件は各catalog・task・[移設モデル](../backend/scheduler/data/relocation.json)の仮定。履歴の価格は採点へ使わない。
- 紹介映像の短い処理時間・家具・大規模配置は撮影用synthetic条件。[映像の出典と再生成](HACKATHON_MEDIA_V3.md)を参照し、正式比較の成績に混ぜない。

## ソフトウェア・モデル・配布

Pythonの固定依存は[requirements-lock.txt](../requirements-lock.txt)。確認したインストールmetadataはattrs、jsonschema、jsonschema-specifications、referencing、rpds-pyがMIT、typing_extensionsがPSF-2.0。依存バイナリはリポジトリで再配布しない。SimPyは初期設計の参考資料で、現在の実行器は独自のPoCイベントエンジン。

GPT Luna / Jevは[共通契約](SCHEDULER_INTERFACE.md)を介して使用する。[OpenAI公開方針](https://openai.com/policies/sharing-publication-policy/)、[TypeSafe MCA](https://typesafe.ai/legal/mca)も参照するが、個別契約・NDAの確認を代替しない。保存した方針要約を非公開の内部思考やlive推論として提示しない。

配布UIは`node scripts/export-benchmark-ui.mjs`で出力し、第三者表示・LeMat本文・元論文対応・既存MIT本文を含める。原本、workflow、保存resultとreportのhashは変更しない。単独動画の説明欄等には[クレジット例](../THIRD_PARTY_NOTICES.md#model-outputs-and-media-credits)とこの文書へのリンクを添える。

## 再確認

```sh
node scripts/build-source-inventory.mjs
node --test tests/integration/shared-results.test.mjs
npm run check:import
```

公開範囲を広げる場合は、inventoryで未確認の原論文文章、プロジェクト自身の公開ライセンス、共同著作者・所属機関の権限を確認する。ライセンス同梱と出典整備だけで、全ての権利処理が完了したとは扱わない。
