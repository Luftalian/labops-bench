# 確認した資料

確認日：2026-10-21。設計判断自体はチーム案。以下は利用技術・資料の出所。

- [LeMat-Synth README](https://github.com/LeMaterial/lematerial-llm-synthesis)：構造化された合成手順の抽出と既存datasetへの案内。実レコードの取得・検証は未実施。
- [LeMat-Synth Dataset Access](https://lematerial.github.io/lematerial-llm-synthesis/getting-started/dataset/)：アクセス申請と認証。
- [Hugging Face dataset](https://huggingface.co/datasets/LeMaterial/LeMat-Synth)：公開ページでは利用条件への同意が必要と表示。
- [SimPy shared resources](https://simpy.readthedocs.io/en/stable/simpy_intro/shared_resources.html)：共有リソースと待ち行列。独立した装置instanceや真のbatch処理の意味は本プロジェクトで別途実装する。
- [Codex skills](https://learn.chatgpt.com/docs/build-skills)：リポジトリ内の`.agents/skills/`。
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)：共有指示の配置。
- [jsonschema](https://python-jsonschema.readthedocs.io/en/stable/validate/)：Draft202012Validator。
- [actions/checkout](https://github.com/actions/checkout)、[actions/setup-python](https://github.com/actions/setup-python)：CI用Actionの公式利用例。

添付会話に含まれる過去ハッカソンの件数、先行研究の優劣、提出締切・動画上限は今回の準備では再調査していないため、公開主張の根拠として転記していない。
