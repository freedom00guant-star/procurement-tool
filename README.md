# 調達進捗管理支援ツール

## セットアップ

```bash
# 1. APIキー設定
cp .env.example .env
# .env を開いて ANTHROPIC_API_KEY= の後にキーを貼り付ける

# 2. 依存ライブラリ（すでに入っていれば不要）
pip3 install anthropic
```

## 使い方

```bash
# ファイルで案件情報を渡す（推奨）
python3 procurement.py sample_case.txt

# 標準入力で渡す
python3 procurement.py
# → 案件情報を入力して Ctrl+D で実行
```

## 出力

| 項目 | 内容 |
|------|------|
| ① 状態分類 | 正常／要注意／遅延リスク高／遅延発生 |
| ② 根拠 | 判断の根拠となる引用 |
| ③ 催促レベル | 弱／中／強 |
| ④ 確認事項 | 最大4項目 |
| ⑤ 作成メール | 件名＋本文（600〜900字） |
| ⑥ 安全補正後メール | クレーム回避表現に調整 |
| ⑦ 社内共有要約 | 60文字以内 |

結果は `result_YYYYMMDD_HHMMSS.txt` に自動保存されます。
