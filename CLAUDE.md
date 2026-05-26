# CLAUDE.md — 調達進捗管理支援ツール

このファイルは Claude Code がこのリポジトリで作業する際のガイドラインを定義します。

---

## プロジェクト概要

**調達進捗管理支援ツール**（Python / Anthropic Claude API）

サプライヤーへの催促・状態判断・メール作成を AI で自動化し、調達遅延を防ぐ。

| ファイル | 役割 |
|---------|------|
| `procurement.py` | メインスクリプト（分析・出力・保存） |
| `sample_case.txt` | 動作確認用サンプル案件 |
| `.env` | API キー設定（Git 管理外） |
| `.env.example` | `.env` のテンプレート |
| `result_YYYYMMDD_HHMMSS.txt` | 分析結果（自動生成） |

---

## 処理フロー

```
案件情報（テキスト入力）
  │
  ▼
① 状態分類      正常 / 要注意 / 遅延リスク高 / 遅延発生
  │
  ▼
② 確認事項設計  最大4項目（状態に応じた優先度）
  │
  ▼
③ メール作成    件名30文字以内・本文600〜900文字
  │
  ▼
④ クレーム回避補正  表現を柔らかく調整しつつ要点を維持
  │
  ▼
結果表示 + result_YYYYMMDD_HHMMSS.txt に保存
```

---

## 出力項目

| 項番 | 項目 | 仕様 |
|------|------|------|
| ① | 状態分類 | 正常／要注意／遅延リスク高／遅延発生 のいずれか |
| ② | 根拠（引用） | 判断根拠となる案件情報からの引用・説明（100字程度） |
| ③ | 催促レベル | 弱／中／強 のいずれか |
| ④ | 今回確認事項 | 最大4項目 箇条書き |
| ⑤ | 作成メール | 件名（30文字以内）＋本文（600〜900文字） |
| ⑥ | 安全補正後メール | クレーム回避表現に調整したメール |
| ⑦ | 社内共有要約 | 60文字以内 |

---

## 技術スタック

- Python 3.9+
- `anthropic` ライブラリ（`pip3 install anthropic`）
- 外部フレームワーク・DBなし

---

## セットアップ

```bash
# 1. APIキー設定
cp .env.example .env
# .env を開き ANTHROPIC_API_KEY=sk-ant-... を貼り付け

# 2. ライブラリ確認
pip3 show anthropic
```

---

## 実行方法

```bash
# ファイルで案件情報を渡す（推奨）
python3 procurement.py sample_case.txt

# モックモード（APIキー不要・動作確認用）
python3 procurement.py --mock sample_case.txt

# 標準入力で渡す
python3 procurement.py
# → 案件情報を入力して Ctrl+D で実行
```

---

## コーディングルール

- `procurement.py` の `SYSTEM_PROMPT` を編集してプロンプトを調整する
- `OUTPUT_SCHEMA` を編集して出力項目を追加・変更する
- `MOCK_RESULT` はモックモード用のサンプル出力。実装変更時は合わせて更新する
- 結果ファイルは `.gitignore` で管理外とする（`result_*.txt`）
- `.env` は絶対に Git にコミットしない

---

## Git 運用ルール

**コードを変更するたびに必ず GitHub へプッシュすること。**

```bash
git add <変更ファイル>
git commit -m "feat: 変更内容を簡潔に記述"
git push origin main
```

| プレフィックス | 用途 |
|--------------|------|
| `feat:` | 新機能追加 |
| `fix:` | バグ修正 |
| `refactor:` | 動作を変えないコード整理 |
| `docs:` | ドキュメント更新 |
| `prompt:` | プロンプト調整 |

---

## 作業ログ

作業完了後は `/Users/m.yoshida/Claude_Work/作業ログ/` に実施内容を追記すること（親 CLAUDE.md の業務ルールに準拠）。

---

## 参照

- 親ルール: `/Users/m.yoshida/CLAUDE.md`
- GitHub リポジトリ: `https://github.com/freedom00guant-star/procurement-tool`
