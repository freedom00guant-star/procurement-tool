'use strict';

// ===== 定数 =====
const STORAGE_KEY = 'procurement_api_key';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `あなたは調達進捗管理の専門家です。
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
  - 強い表現を柔らかく調整しつつ要点を維持`;

const OUTPUT_SCHEMA = {
  status:          '正常|要注意|遅延リスク高|遅延発生 のいずれか',
  basis:           '判断根拠となる本文からの引用と説明（100字程度）',
  urgency_level:   '弱|中|強 のいずれか',
  check_items:     ['確認事項1', '確認事項2', '確認事項3', '確認事項4'],
  email_subject:   '件名（30文字以内）',
  email_body:      'メール本文（600〜900文字）',
  safe_email_body: 'クレーム回避表現に調整したメール本文（600〜900文字）',
  internal_summary:'社内共有要約（60文字以内）',
};

const SAMPLE = `【案件名】半導体部品（型番：ABC-2024）調達

【発注日】2026年4月10日
【納期】2026年5月30日（本日より4日後）
【発注先】株式会社テクノサプライ 担当：田中様
【発注数量】500個
【発注金額】250万円

【現状メモ】
5月19日に田中様へ納期確認のメールを送ったが、5月26日現在まだ返信がない（7日間未返信）。
前回の電話でも「確認中」との回答のみで、具体的な出荷予定日を教えてもらえていない。
在庫状況も不明。
当社の生産ラインは6月2日から稼働予定で、部品が間に合わないと生産計画に影響が出る。`;

// ===== DOM 要素取得 =====
const $ = id => document.getElementById(id);

const apiKeyInput   = $('api-key-input');
const saveKeyBtn    = $('save-key-btn');
const clearKeyBtn   = $('clear-key-btn');
const keyStatus     = $('key-status');
const caseInput     = $('case-input');
const analyzeBtn    = $('analyze-btn');
const sampleBtn     = $('sample-btn');
const clearBtn      = $('clear-btn');
const loading       = $('loading');
const errorBox      = $('error-box');
const errorMsg      = $('error-msg');
const resultSection = $('result-section');
const copyBtn       = $('copy-btn');

// ===== APIキー管理 =====
function loadKey() {
  const key = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
  if (key) {
    apiKeyInput.value = key;
    showKeyStatus('✅ APIキーが設定されています', 'ok');
  }
}

function saveKey() {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('sk-ant-')) {
    showKeyStatus('❌ 正しいAPIキーを入力してください（sk-ant- で始まります）', 'err');
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, key);
  localStorage.setItem(STORAGE_KEY, key);
  showKeyStatus('✅ 保存しました', 'ok');
}

function clearKey() {
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  apiKeyInput.value = '';
  showKeyStatus('🗑️ クリアしました', '');
}

function showKeyStatus(msg, cls) {
  keyStatus.textContent = msg;
  keyStatus.className = 'status-msg ' + cls;
}

function getKey() {
  return sessionStorage.getItem(STORAGE_KEY)
    || localStorage.getItem(STORAGE_KEY)
    || apiKeyInput.value.trim();
}

// ===== Claude API 呼び出し =====
async function callClaude(caseInfo) {
  const key = getKey();
  if (!key) throw new Error('APIキーが設定されていません。上の入力欄に入力して「保存」してください。');

  const userMessage = `以下の案件情報を分析してください。

## 案件情報
${caseInfo}

## 出力JSON形式
${JSON.stringify(OUTPUT_SCHEMA, null, 2)}

JSONのみで回答してください。前後の説明文は不要です。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTPエラー ${res.status}`;
    if (res.status === 401) throw new Error('APIキーが無効です。正しいキーを設定してください。');
    throw new Error(msg);
  }

  const data = await res.json();
  let raw = data.content[0].text.trim();

  // コードブロック除去
  if (raw.includes('```json')) raw = raw.split('```json')[1].split('```')[0].trim();
  else if (raw.includes('```')) raw = raw.split('```')[1].split('```')[0].trim();

  return JSON.parse(raw);
}

// ===== 結果表示 =====
function renderResult(r) {
  // ① 状態分類
  const statusEl = $('r-status');
  statusEl.textContent = r.status;
  statusEl.className = 'status-badge ' + statusClass(r.status);

  // ② 根拠
  $('r-basis').textContent = r.basis;

  // ③ 催促レベル
  const urgencyEl = $('r-urgency');
  urgencyEl.textContent = r.urgency_level;
  urgencyEl.className = 'urgency-badge ' + urgencyClass(r.urgency_level);

  // ④ 確認事項
  const list = $('r-checks');
  list.innerHTML = '';
  r.check_items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });

  // ⑤ 作成メール
  $('r-subject').textContent     = r.email_subject;
  $('r-body').textContent        = r.email_body;

  // ⑥ 安全補正後メール
  $('r-safe-subject').textContent = r.email_subject;
  $('r-safe-body').textContent    = r.safe_email_body;

  // ⑦ 社内共有要約
  $('r-summary').textContent = r.internal_summary;

  resultSection.classList.remove('hidden');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function statusClass(s) {
  if (s === '正常')       return 'status-normal';
  if (s === '要注意')     return 'status-caution';
  if (s === '遅延リスク高') return 'status-high-risk';
  if (s === '遅延発生')   return 'status-delayed';
  return '';
}

function urgencyClass(u) {
  if (u === '弱') return 'urgency-low';
  if (u === '中') return 'urgency-mid';
  if (u === '強') return 'urgency-high';
  return '';
}

// ===== エラー表示 =====
function showError(msg) {
  errorMsg.textContent = '❌ ' + msg;
  errorBox.classList.remove('hidden');
}
function hideError() {
  errorBox.classList.add('hidden');
}

// ===== 全文テキスト生成（コピー用） =====
function buildFullText(r) {
  return [
    '【調達進捗管理支援 分析結果】',
    '',
    '【① 状態分類】',
    r.status,
    '',
    '【② 根拠（引用）】',
    r.basis,
    '',
    '【③ 催促レベル】',
    r.urgency_level,
    '',
    '【④ 今回確認事項】',
    ...r.check_items.map((item, i) => `${i+1}. ${item}`),
    '',
    '【⑤ 作成メール】',
    `件名：${r.email_subject}`,
    '',
    r.email_body,
    '',
    '【⑥ 安全補正後メール】',
    `件名：${r.email_subject}`,
    '',
    r.safe_email_body,
    '',
    '【⑦ 社内共有要約】',
    r.internal_summary,
  ].join('\n');
}

// ===== 最後の分析結果を保持 =====
let lastResult = null;

// ===== イベント =====
saveKeyBtn.addEventListener('click', saveKey);
clearKeyBtn.addEventListener('click', clearKey);

sampleBtn.addEventListener('click', () => { caseInput.value = SAMPLE; });
clearBtn.addEventListener('click',  () => { caseInput.value = ''; });

analyzeBtn.addEventListener('click', async () => {
  const caseInfo = caseInput.value.trim();
  if (!caseInfo) { showError('案件情報を入力してください。'); return; }

  hideError();
  resultSection.classList.add('hidden');
  loading.classList.remove('hidden');
  analyzeBtn.disabled = true;

  try {
    const result = await callClaude(caseInfo);
    lastResult = result;
    renderResult(result);
  } catch (e) {
    showError(e.message);
  } finally {
    loading.classList.add('hidden');
    analyzeBtn.disabled = false;
  }
});

// 全文コピー
copyBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  await navigator.clipboard.writeText(buildFullText(lastResult));
  const orig = copyBtn.textContent;
  copyBtn.textContent = '✅ コピーしました';
  setTimeout(() => { copyBtn.textContent = orig; }, 1500);
});

// メール個別コピー
document.addEventListener('click', async e => {
  if (!e.target.classList.contains('copy-mail-btn')) return;
  const bodyEl    = $(e.target.dataset.target);
  const subjectEl = $(e.target.dataset.subject);
  const text = `件名：${subjectEl.textContent}\n\n${bodyEl.textContent}`;
  await navigator.clipboard.writeText(text);
  const orig = e.target.textContent;
  e.target.textContent = '✅ コピーしました';
  setTimeout(() => { e.target.textContent = orig; }, 1500);
});

// ===== 初期化 =====
loadKey();
