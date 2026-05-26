#!/usr/bin/env python3
"""調達進捗管理支援ツール

フロー: 1.判断状況 → 2.確認事項設計 → 3.メール作成 → 4.クレーム回避補正

使い方:
  python3 procurement.py sample_case.txt       # ファイル指定
  python3 procurement.py --mock sample_case.txt # モックモード（APIキー不要）
"""

import anthropic
import json
import os
import sys
from datetime import datetime
from pathlib import Path


def _load_env(env_path: Path) -> None:
    """シンプルな .env パーサー（外部ライブラリ不要）"""
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


# スクリプトと同階層の .env を自動読み込み
_load_env(Path(__file__).parent / ".env")

SYSTEM_PROMPT = """あなたは調達進捗管理の専門家です。
案件情報を以下の4ステップで分析し、必ずJSON形式のみで回答してください。

ステップ1【状態分類】
  - 正常：納期内、問題なし
  - 要注意：軽微なリスクあり、注視が必要
  - 遅延リスク高：納期遅れの可能性が高い
  - 遅延発生：すでに遅延している

ステップ2【確認事項設計】
  - 状態に応じた優先度の高い確認事項を最大4項目

ステップ3【メール作成】
  - 件名：30文字以内
  - 本文：600〜900文字（挨拶・事実共有・確認事項・期限・締め）

ステップ4【クレーム回避補正】
  - 強い表現を柔らかく調整しつつ要点を維持
"""

OUTPUT_SCHEMA = {
    "status": "正常|要注意|遅延リスク高|遅延発生 のいずれか",
    "basis": "判断根拠となる本文からの引用と説明（100字程度）",
    "urgency_level": "弱|中|強 のいずれか",
    "check_items": ["確認事項1", "確認事項2", "確認事項3", "確認事項4"],
    "email_subject": "件名（30文字以内）",
    "email_body": "メール本文（600〜900文字）",
    "safe_email_body": "クレーム回避表現に調整したメール本文（600〜900文字）",
    "internal_summary": "社内共有要約（60文字以内）",
}

MOCK_RESULT = {
    "status": "遅延リスク高",
    "basis": "「5月19日に確認メールを送ったが7日間未返信」「電話でも確認中のみ」という記述から、\n  サプライヤー側の応答が止まっており、納期4日前での遅延リスクが極めて高いと判断。",
    "urgency_level": "強",
    "check_items": [
        "出荷予定日の確定（5月28日中に回答期限）",
        "現在の在庫数量・製造進捗状況の確認",
        "納期遅延の場合の代替調達先の検討",
        "生産ライン開始日（6月2日）への影響確認と社内報告",
    ],
    "email_subject": "【急ぎ】半導体部品ABC-2024 納期確認のお願い",
    "email_body": """株式会社テクノサプライ
田中様

平素より大変お世話になっております。
〇〇株式会社 調達部の△△と申します。

先日5月19日にお送りしたメールについて、ご確認いただけましたでしょうか。
本日5月26日現在、ご返信をまだ頂戴できておらず、ご連絡差し上げた次第です。

今回ご発注させていただいております半導体部品（型番：ABC-2024）につきまして、
納期が5月30日と迫っており、当社の生産スケジュールへの影響が懸念されております。

つきましては、以下の点について至急ご確認・ご回答をお願いできますでしょうか。

【確認事項】
1. 出荷予定日はいつになりますでしょうか
2. 現在の在庫数量および製造進捗状況をお知らせください
3. 万が一納期が遅れる場合、いつごろお届けいただけますでしょうか
4. 代替品対応など、御社にて検討可能な解決策はございますでしょうか

大変お手数をおかけしますが、5月28日（木）正午までにご回答いただけますと幸いです。
当社の生産ラインが6月2日より稼働予定のため、それまでに部品の確保が必要な状況です。

何かご不明な点がございましたら、お気軽にご連絡ください。
ご対応のほど、どうぞよろしくお願い申し上げます。""",
    "safe_email_body": """株式会社テクノサプライ
田中様

平素より大変お世話になっております。
〇〇株式会社 調達部の△△でございます。

5月19日にご送付したメールについて、ご多忙のところ恐れ入りますが、
本日改めてご連絡させていただきました。

ご発注いただいております半導体部品（型番：ABC-2024）の納期が
5月30日に迫っておりまして、当社の生産スケジュールとの調整のため、
現況をご共有いただけますと大変助かります。

お忙しいところ誠に恐縮ではございますが、以下についてご教示いただけましたら幸いです。

【ご確認のお願い】
1. 出荷予定日についてお知らせいただけますでしょうか
2. 現在の在庫・製造の進捗状況をご共有いただけますでしょうか
3. 万が一スケジュール調整が必要な場合、想定時期をお知らせいただけますでしょうか
4. 代替対応など、ご検討可能な選択肢がありましたらご教示ください

誠に勝手なお願いではございますが、5月28日（木）正午ごろを目安に
お返事いただけますと、社内手配が円滑に進みますので大変助かります。

ご不明な点がございましたら、いつでもご連絡ください。
引き続きどうぞよろしくお願い申し上げます。""",
    "internal_summary": "ABC-2024：納期4日前・先方7日未返信。遅延リスク高。5/28正午を回答期限に催促。",
}


def analyze_with_api(case_info: str) -> dict:
    client = anthropic.Anthropic()

    user_message = f"""以下の案件情報を分析してください。

## 案件情報
{case_info}

## 出力JSON形式
{json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}

JSONのみで回答してください。前後の説明文は不要です。"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = message.content[0].text.strip()

    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    return json.loads(raw)


def analyze_mock(_case_info: str) -> dict:
    """APIキー不要のモックモード（動作確認用）"""
    print("  ※ モックモードで実行中（実際のAI分析は行いません）")
    return MOCK_RESULT


def format_output(result: dict) -> str:
    lines = [
        "=" * 60,
        "【調達進捗管理支援 分析結果】",
        "=" * 60,
        f"\n【① 状態分類】\n  {result['status']}",
        f"\n【② 根拠（引用）】\n  {result['basis']}",
        f"\n【③ 催促レベル】\n  {result['urgency_level']}",
        "\n【④ 今回確認事項】",
    ]
    for i, item in enumerate(result["check_items"], 1):
        lines.append(f"  {i}. {item}")

    lines += [
        "\n【⑤ 作成メール】",
        f"  件名：{result['email_subject']}",
        f"\n{result['email_body']}",
        "\n【⑥ 安全補正後メール】",
        f"  件名：{result['email_subject']}",
        f"\n{result['safe_email_body']}",
        f"\n【⑦ 社内共有要約】\n  {result['internal_summary']}",
        "\n" + "=" * 60,
    ]
    return "\n".join(lines)


def read_input(args: list) -> str:
    if args and not args[0].startswith("--"):
        p = Path(args[0])
        if not p.exists():
            print(f"エラー: ファイルが見つかりません → {p}", file=sys.stderr)
            sys.exit(1)
        print(f"ファイル読み込み: {p}")
        return p.read_text(encoding="utf-8")

    print("案件情報を入力してください（終了: Ctrl+D / Ctrl+Z）:")
    print("-" * 40)
    lines = []
    try:
        while True:
            lines.append(input())
    except EOFError:
        pass
    return "\n".join(lines)


def main():
    print("=" * 60)
    print("  調達進捗管理支援ツール")
    print("=" * 60)

    args = sys.argv[1:]
    mock_mode = "--mock" in args
    args = [a for a in args if a != "--mock"]

    case_info = read_input(args)
    if not case_info.strip():
        print("エラー: 案件情報が空です", file=sys.stderr)
        sys.exit(1)

    print("\n分析中...")

    try:
        if mock_mode or not os.environ.get("ANTHROPIC_API_KEY"):
            if not mock_mode:
                print("  ※ ANTHROPIC_API_KEY が未設定のためモックモードで実行します")
            result = analyze_mock(case_info)
        else:
            result = analyze_with_api(case_info)
    except json.JSONDecodeError as e:
        print(f"JSONパースエラー: {e}", file=sys.stderr)
        sys.exit(1)
    except anthropic.APIError as e:
        print(f"API エラー: {e}", file=sys.stderr)
        sys.exit(1)

    output = format_output(result)
    print(output)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = Path(__file__).parent / f"result_{timestamp}.txt"
    out_path.write_text(output, encoding="utf-8")
    print(f"結果を保存しました: {out_path}")


if __name__ == "__main__":
    main()
