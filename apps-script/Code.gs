/**
 * ふたりのホーム API（Apps Script）
 *
 * 画面（GitHub Pages のサイト）からのお願いを受け付けて、しゅうくんの Googleドライブを読み書きする窓口です。
 *
 * デプロイ設定（ウェブアプリ）
 *   次のユーザーとして実行 ＝ 自分
 *   アクセスできるユーザー ＝ 全員
 * 「全員」にしても、Googleログインで本人確認でき、台帳「設定」L列のメールの人以外はすべて断ります。
 */

// ▼ Google Cloud で作った OAuth クライアントID を入れる
const CLIENT_ID = 'ここにクライアントIDを貼る.apps.googleusercontent.com';

const MONEY_ID = '1lsNoI837NrxVJTpXI92RdQQLnfjNYcbPqSqEUOAWd6M';   // お金/ふたりのお金 台帳
const TODO_ID  = '1551Q4cmKDR548uY1oc_eaK-gOAd8cml3658_1ez3uU0';   // やること/ふたりのやること
const FOLDERS = {
  root:       '1wB1vA_-J3nNG4dHAbefkivivaZoTHi6f',
  money:      '1f6Awrp3VWKHOUDT5DAwiC1LqvUMxOsUe',
  docs:       '1K777WCTKMH0Tpp0BD8kXHZVejOnJc5Ih',
  photos:     '19Eo54h8kNxvNzXCGMLVGozDVztmfV3zZ',
  todo:       '1IySh_y5klOJ2po3Zzv3CjimiqJHs2JTS',
  secret:     '1RTi7abAEXLWWUdfj8AC8yJSj7STOn0oS',
  homePhotos: '1Oxnj7MBIVOf4jZA6mFaLQ3RTYeROO6Tx'
};
const TZ = 'Asia/Tokyo';
const SESSION_DAYS = 30;                     // 一度ログインしたら30日はそのまま使える
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const SH = { exp: '支出', wish: '買いたいもの', conf: '設定', todo: 'やること' };
const EXP_W = 9;   // 日付 プロジェクト 項目 金額 払った人 カテゴリ メモ レシート ID
const WISH_W = 8;  // プロジェクト 品名 メモ 予算 カテゴリ 優先度 状態 ID
const TODO_W = 8;  // やること リスト 担当 期限 状態 メモ 完了日 ID

/* =========================================================
 * 入り口
 * ======================================================= */

function doGet() {
  return json_({ ok: true, service: 'futari-home-api' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'リクエストを読めませんでした。', code: 'bad_request' }); }
  try {
    if (req.action === 'login') return json_({ ok: true, data: login_(req.idToken) });
    const me = auth_(req.session);
    const fn = ACTIONS[req.action];
    if (!fn) throw err_('不明な操作です。', 'bad_request');
    return json_({ ok: true, data: fn(me, req.args || []) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err), code: (err && err.code) || 'error' });
  }
}

const ACTIONS = {
  getAll:          (me)    => getAll_(me),
  getData:         (me)    => moneyData_(me),
  getTodos:        (me)    => todoData_(),
  getHomePhoto:    (me)    => getHomePhoto_(),
  uploadHomePhoto: (me, a) => uploadHomePhoto_(a[0], a[1]),
  addExpense:      (me, a) => addExpense_(me, a[0]),
  deleteExpense:   (me, a) => deleteExpense_(me, a[0]),
  addWish:         (me, a) => addWish_(me, a[0]),
  setWishEstimate: (me, a) => setWishEstimate_(me, a[0], a[1]),
  buyWish:         (me, a) => buyWish_(me, a[0], a[1]),
  deleteWish:      (me, a) => deleteWish_(me, a[0]),
  addTodo:         (me, a) => addTodo_(a[0]),
  setTodoDone:     (me, a) => setTodoDone_(a[0], a[1]),
  deleteTodo:      (me, a) => deleteTodo_(a[0]),
  logout:          (me)    => logout_(me)
};

/* =========================================================
 * ログイン（Googleの本人確認 → 30日有効の合言葉を発行）
 * ======================================================= */

function login_(idToken) {
  if (!idToken) throw err_('ログイン情報がありません。', 'auth');
  if (CLIENT_ID.indexOf('ここに') === 0) throw err_('窓口にクライアントIDが設定されていません。', 'setup');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw err_('Googleのログインを確認できませんでした。もう一度ログインしてください。', 'auth');
  const info = JSON.parse(res.getContentText());
  const okIss = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== CLIENT_ID || !okIss || String(info.email_verified) !== 'true' || Number(info.exp) * 1000 < Date.now()) {
    throw err_('Googleのログインを確認できませんでした。もう一度ログインしてください。', 'auth');
  }
  const email = String(info.email).toLowerCase();
  const conf = settings_(money_(), email);
  if (!conf.allowed) throw err_('このアカウント（' + email + '）は使えません。', 'forbidden');

  const props = PropertiesService.getScriptProperties();
  cleanSessions_(props);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  props.setProperty('s_' + hash_(token), JSON.stringify({ email: email, exp: exp }));
  return { session: token, email: email, member: conf.meMember };
}

function auth_(session) {
  if (!session) throw err_('ログインしてください。', 'auth');
  const props = PropertiesService.getScriptProperties();
  const key = 's_' + hash_(session);
  const raw = props.getProperty(key);
  if (!raw) throw err_('ログインの有効期限が切れました。もう一度ログインしてください。', 'auth');
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) { props.deleteProperty(key); throw err_('ログインの有効期限が切れました。もう一度ログインしてください。', 'auth'); }
  const ss = money_();
  const conf = settings_(ss, s.email);
  if (!conf.allowed) { props.deleteProperty(key); throw err_('このアカウントは使えません。', 'forbidden'); }
  return { email: s.email, member: conf.meMember, members: conf.members.map(m => m.name), conf: conf, ss: ss, key: key };
}

function logout_(me) {
  PropertiesService.getScriptProperties().deleteProperty(me.key);
  return true;
}

function cleanSessions_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('s_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/* =========================================================
 * 読み込み
 * ======================================================= */

function getAll_(me) {
  const folders = {};
  Object.keys(FOLDERS).forEach(k => folders[k] = 'https://drive.google.com/drive/folders/' + FOLDERS[k]);
  return {
    me: { email: me.email, member: me.member, members: me.members },
    money: moneyData_(me), todos: todoData_(), folders: folders
  };
}

function moneyData_(me) {
  const ss = me.ss, conf = me.conf;
  const expenses = readRows_(ss.getSheetByName(SH.exp), EXP_W, 8, r => r[2] !== '' || r[3] !== '')
    .map(r => ({
      id: String(r[8]), date: fmtDate_(r[0]), project: String(r[1]), item: String(r[2]),
      amount: Number(r[3]) || 0, payer: String(r[4]), category: String(r[5]), memo: String(r[6] || '')
    }));
  const wishes = readRows_(ss.getSheetByName(SH.wish), WISH_W, 7, r => r[1] !== '')
    .map(r => ({
      id: String(r[7]), project: String(r[0]), item: String(r[1]), note: String(r[2] || ''),
      estimate: r[3] === '' ? null : (Number(r[3]) || 0), category: String(r[4]),
      priority: String(r[5] || ''), status: String(r[6] || '未購入')
    }));
  return {
    members: conf.members.map(m => m.name), meMember: conf.meMember,
    projects: conf.projects, categories: conf.categories,
    expenses: expenses, wishes: wishes,
    today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    sheetUrl: ss.getUrl()
  };
}

function todoData_() {
  const ss = SpreadsheetApp.openById(TODO_ID);
  const items = readRows_(ss.getSheetByName(SH.todo), TODO_W, 7, r => r[0] !== '')
    .map(r => ({
      id: String(r[7]), title: String(r[0]), list: String(r[1] || ''), owner: String(r[2] || ''),
      due: fmtDate_(r[3]), done: String(r[4]) === '完了', memo: String(r[5] || ''), doneAt: fmtDate_(r[6])
    }));
  return { items: items, today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), sheetUrl: ss.getUrl() };
}

/** 台帳「設定」を読む。L列にメールが入っている人だけが allowed */
function settings_(ss, email) {
  const conf = ss.getSheetByName(SH.conf);
  const cv = conf.getRange(2, 1, Math.max(conf.getLastRow() - 1, 1), 12).getValues();
  const members = cv
    .filter(r => String(r[10]).trim())
    .map(r => ({ name: String(r[10]).trim(), email: String(r[11] || '').trim().toLowerCase() }));
  const categories = cv.map(r => String(r[8]).trim()).filter(Boolean);
  const projects = cv.filter(r => String(r[0]).trim()).map(r => {
    const budgets = {};
    if (members[0]) budgets[members[0].name] = Number(r[3]) || 0;
    if (members[1]) budgets[members[1].name] = Number(r[4]) || 0;
    return { name: String(r[0]).trim(), status: String(r[1] || ''), note: String(r[6] || ''), budgets: budgets };
  });
  const mine = members.find(m => m.email && m.email === email);
  return { members: members, categories: categories, projects: projects, allowed: !!mine, meMember: mine ? mine.name : '' };
}

/* =========================================================
 * ホームの写真
 * ======================================================= */

function getHomePhoto_() {
  const files = DriveApp.getFolderById(FOLDERS.homePhotos).getFiles();
  const list = [];
  while (files.hasNext()) {
    const f = files.next();
    if (/^image\//.test(f.getMimeType()) && f.getSize() <= PHOTO_MAX_BYTES) list.push(f);
  }
  if (!list.length) return null;
  return photoPayload_(list[Math.floor(Math.random() * list.length)], list.length);
}

function uploadHomePhoto_(dataUrl, name) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw err_('画像を読み込めませんでした。別の写真で試してください。');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > PHOTO_MAX_BYTES) throw err_('写真が大きすぎます。');
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  const base = String(name || 'photo').slice(0, 40).replace(/\.[^.]+$/, '').replace(/[\\\/:*?"<>|]/g, '');
  const folder = DriveApp.getFolderById(FOLDERS.homePhotos);
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], 'home-' + stamp + '-' + base + '.jpg'));
  let count = 0; const it = folder.getFiles(); while (it.hasNext()) { it.next(); count++; }
  return photoPayload_(file, count);
}

function photoPayload_(file, count) {
  const blob = file.getBlob();
  return { id: file.getId(), count: count, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

/* =========================================================
 * お金：書き込み（最新のお金データを返す）
 * ======================================================= */

function addExpense_(me, e) {
  const amount = Math.round(Number(e && e.amount));
  if (!clean_(e && e.item)) throw err_('項目を入れてください。');
  if (!(amount > 0)) throw err_('金額を1円以上で入れてください。');
  return moneyWrite_(me, ss => appendExpense_(ss, e, amount));
}

function deleteExpense_(me, id) {
  return moneyWrite_(me, ss => {
    const sh = ss.getSheetByName(SH.exp);
    const row = findRow_(sh, 8, id);
    if (row > 0) sh.deleteRow(row);
  });
}

function addWish_(me, w) {
  if (!clean_(w && w.item)) throw err_('品名を入れてください。');
  const est = w.estimate === '' || w.estimate == null ? '' : Math.round(Number(w.estimate));
  if (est !== '' && !(est >= 0)) throw err_('予算は0以上の数字で入れてください。');
  return moneyWrite_(me, ss => {
    ss.getSheetByName(SH.wish).appendRow([
      clean_(w.project), clean_(w.item, 60), clean_(w.note, 120), est,
      clean_(w.category), clean_(w.priority), '未購入', newId_()
    ]);
  });
}

function setWishEstimate_(me, id, estimate) {
  const est = estimate === '' || estimate == null ? '' : Math.round(Number(estimate));
  if (est !== '' && !(est >= 0)) throw err_('予算は0以上の数字で入れてください。');
  return moneyWrite_(me, ss => {
    const sh = ss.getSheetByName(SH.wish);
    const row = findRow_(sh, 7, id);
    if (row < 0) throw err_('この項目は見つかりませんでした。画面を更新してください。');
    sh.getRange(row, 4).setValue(est);
  });
}

function buyWish_(me, id, e) {
  const amount = Math.round(Number(e && e.amount));
  if (!(amount > 0)) throw err_('金額を1円以上で入れてください。');
  return moneyWrite_(me, ss => {
    const sh = ss.getSheetByName(SH.wish);
    const row = findRow_(sh, 7, id);
    if (row < 0) throw err_('この項目は見つかりませんでした。画面を更新してください。');
    appendExpense_(ss, e, amount);
    sh.getRange(row, 7).setValue('購入済み');
  });
}

function deleteWish_(me, id) {
  return moneyWrite_(me, ss => {
    const sh = ss.getSheetByName(SH.wish);
    const row = findRow_(sh, 7, id);
    if (row > 0) sh.deleteRow(row);
  });
}

/* =========================================================
 * やること：書き込み（最新のやることデータを返す）
 * ======================================================= */

function addTodo_(t) {
  if (!clean_(t && t.title)) throw err_('やることを入れてください。');
  return todoWrite_(ss => {
    const due = fmtDate_(t.due);
    ss.getSheetByName(SH.todo).appendRow([
      clean_(t.title, 80), clean_(t.list, 30), clean_(t.owner, 20),
      due ? due.replace(/-/g, '/') : '', '未完了', clean_(t.memo, 200), '', newId_()
    ]);
  });
}

function setTodoDone_(id, done) {
  return todoWrite_(ss => {
    const sh = ss.getSheetByName(SH.todo);
    const row = findRow_(sh, 7, id);
    if (row < 0) throw err_('この項目は見つかりませんでした。画面を更新してください。');
    sh.getRange(row, 5).setValue(done ? '完了' : '未完了');
    sh.getRange(row, 7).setValue(done ? Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd') : '');
  });
}

function deleteTodo_(id) {
  return todoWrite_(ss => {
    const sh = ss.getSheetByName(SH.todo);
    const row = findRow_(sh, 7, id);
    if (row > 0) sh.deleteRow(row);
  });
}

/* =========================================================
 * 内部用
 * ======================================================= */

function money_() { return SpreadsheetApp.openById(MONEY_ID); }

function lock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { fn(); SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
}

function moneyWrite_(me, fn) { lock_(() => fn(me.ss)); return moneyData_(me); }

function todoWrite_(fn) {
  const ss = SpreadsheetApp.openById(TODO_ID);
  lock_(() => fn(ss));
  return todoData_();
}

function appendExpense_(ss, e, amount) {
  const date = fmtDate_(e.date) || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  ss.getSheetByName(SH.exp).appendRow([
    date.replace(/-/g, '/'), clean_(e.project), clean_(e.item, 60), amount,
    clean_(e.payer), clean_(e.category), clean_(e.memo, 200), '', newId_()
  ]);
}

/** 2行目以降を読み、ID が空の行には ID を振って書き戻す */
function readRows_(sh, width, idIdx, isRow) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, width).getValues();
  const out = [];
  vals.forEach((r, i) => {
    if (!isRow(r)) return;
    if (!r[idIdx]) { r[idIdx] = newId_(); sh.getRange(i + 2, idIdx + 1).setValue(r[idIdx]); }
    out.push(r);
  });
  return out;
}

function findRow_(sh, idIdx, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, idIdx + 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function newId_() { return Utilities.getUuid().slice(0, 8); }

function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (!v) return '';
  const m = String(v).trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

/** 文字を整え、数式として解釈されないようにする */
function clean_(s, max) {
  let t = String(s == null ? '' : s).trim().slice(0, max || 100);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return t;
}

function err_(msg, code) { const e = new Error(msg); e.code = code || 'error'; return e; }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 初回だけエディタから実行：ドライブ・スプレッドシート・外部通信の許可をまとめて出す */
function setup() {
  money_().getName();
  SpreadsheetApp.openById(TODO_ID).getName();
  DriveApp.getFolderById(FOLDERS.homePhotos).getName();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  Logger.log('準備OK');
}
