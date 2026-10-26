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
const CLIENT_ID = '264124983411-o94hvp7221a45f6c59trdv628nt97flo.apps.googleusercontent.com';

const MONEY_ID = '1lsNoI837NrxVJTpXI92RdQQLnfjNYcbPqSqEUOAWd6M';   // お金/ふたりのお金 台帳
const TODO_ID  = '1551Q4cmKDR548uY1oc_eaK-gOAd8cml3658_1ez3uU0';   // 暮らし/ふたりの暮らし（やること・買い物・保証・ホーム設定）
const FIXED_ID = '105jNfd5tCU2Sj_EIoxdajUWtUfKB5PBQZ4FQHfJZSig';   // お金/ふたりの共通口座（固定費・お小遣い・残高）
const VAULT_NAME = 'ふたりの機密（暗号化済み）.json';                // 機密フォルダに作られる。中身は暗号化された文字だけ
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
  logout:          (me)    => logout_(me),
  // 暮らし：買い物・保証
  addShop:         (me, a) => addShop_(me, a[0], a[1]),
  toggleShop:      (me, a) => toggleShop_(a[0], a[1]),
  deleteShop:      (me, a) => deleteShop_(a[0]),
  clearShopDone:   (me)    => clearShopDone_(),
  setWarranty:     (me, a) => setWarranty_(a[0]),
  deleteWarranty:  (me, a) => deleteWarranty_(a[0]),
  // お金：プロジェクト
  addProject:      (me, a) => addProject_(me, a[0]),
  setProjectStatus:(me, a) => setProjectStatus_(me, a[0], a[1]),
  // 固定費（共通口座）
  getFixed:        (me)    => fixedData_(me),
  addFixedItem:    (me, a) => addFixedItem_(me, a[0]),
  updateFixedItem: (me, a) => updateFixedItem_(me, a[0], a[1]),
  setFixedRecord:  (me, a) => setFixedRecord_(me, a[0], a[1], a[2], a[3]),
  addDeposit:      (me, a) => addDeposit_(me, a[0]),
  deleteDeposit:   (me, a) => deleteDeposit_(me, a[0]),
  setRatio:        (me, a) => setRatio_(me, a[0]),
  addExtra:        (me, a) => addExtra_(me, a[0]),
  deleteExtra:     (me, a) => deleteExtra_(me, a[0]),
  setBalance:      (me, a) => setBalance_(me, a[0], a[1], a[2]),
  setAllowance:    (me, a) => setAllowance_(me, a[0]),
  // 書類
  getDocs:         (me)    => docsData_(),
  uploadDoc:       (me, a) => uploadDoc_(a[0], a[1], a[2]),
  addDocFolder:    (me, a) => addFolder_(FOLDERS.docs, a[0], docsData_),
  // 写真
  getAlbums:       (me)    => albumsData_(),
  getAlbum:        (me, a) => albumData_(a[0]),
  addAlbum:        (me, a) => addFolder_(FOLDERS.photos, a[0], albumsData_),
  uploadPhoto:     (me, a) => uploadPhoto_(a[0], a[1], a[2]),
  setHomeFromPhoto:(me, a) => setHomeFromPhoto_(a[0]),
  // 共通
  getFileData:     (me, a) => fileData_(a[0]),
  trashFile:       (me, a) => trashFile_(a[0]),
  // 機密（暗号化された文字をそのまま預かるだけ）
  getVault:        (me)    => getVault_(),
  saveVault:       (me, a) => saveVault_(me, a[0], a[1])
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
    money: moneyData_(me), todos: todoData_(), fixed: fixedData_(me), home: homeData_(), folders: folders
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
 * 暮らし：ホーム設定（記念日・ごみの日）・買い物・保証期限
 * ======================================================= */

function kurashi_() { return SpreadsheetApp.openById(TODO_ID); }

function homeData_() {
  const ss = kurashi_();
  const sh = ss.getSheetByName('ホーム設定');
  const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), 8).getValues();
  const kv = {};
  v.slice(1).forEach(r => { if (String(r[0]).trim()) kv[String(r[0]).trim()] = r[1]; });
  const DOW = '日月火水木金土';
  const garbage = v.slice(1).filter(r => String(r[3]).trim()).map(r => ({
    kind: String(r[3]).trim(),
    days: String(r[4]).split(/[,、・\s]+/).map(x => x.replace('曜日', '').replace('曜', '').trim()).filter(x => x.length === 1).map(x => DOW.indexOf(x)).filter(i => i >= 0),
    nths: /毎週/.test(String(r[5])) || !String(r[5]).trim() ? [] : (String(r[5]).match(/\d/g) || []).map(Number),
    time: String(r[6] || ''), memo: String(r[7] || '')
  }));
  return {
    anniversary: fmtDate_(kv['記念日']), anniversaryLabel: String(kv['記念日の呼び方'] || '記念日'),
    garbageArea: String(kv['ごみの地域'] || ''), garbage: garbage,
    shop: shopData_(ss), warranties: warrantyData_(ss),
    today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), sheetUrl: ss.getUrl()
  };
}

function shopData_(ss) {
  return readRows_((ss || kurashi_()).getSheetByName('買い物'), 6, 5, r => r[0] !== '').map(r => ({
    id: String(r[5]), name: String(r[0]), memo: String(r[1] || ''), done: String(r[2]) === '済', by: String(r[3] || ''), added: fmtDate_(r[4])
  }));
}

function warrantyData_(ss) {
  return readRows_((ss || kurashi_()).getSheetByName('保証'), 5, 4, r => r[0] !== '' || r[1] !== '').map(r => ({
    id: String(r[4]), name: String(r[0]), date: fmtDate_(r[1]), fileId: String(r[2] || ''), memo: String(r[3] || '')
  }));
}

function shopWrite_(fn) { const ss = kurashi_(); lock_(() => fn(ss.getSheetByName('買い物'))); return shopData_(ss); }

function addShop_(me, name, memo) {
  const n = clean_(name, 60);
  if (!n) throw err_('品名を入れてください。');
  return shopWrite_(sh => sh.appendRow([n, clean_(memo, 60), '未', me.member || '', Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd'), newId_()]));
}
function toggleShop_(id, done) {
  return shopWrite_(sh => { const row = findRow_(sh, 5, id); if (row > 0) sh.getRange(row, 3).setValue(done ? '済' : '未'); });
}
function deleteShop_(id) {
  return shopWrite_(sh => { const row = findRow_(sh, 5, id); if (row > 0) sh.deleteRow(row); });
}
function clearShopDone_() {
  return shopWrite_(sh => {
    const last = sh.getLastRow();
    if (last < 2) return;
    const v = sh.getRange(2, 3, last - 1, 1).getValues();
    for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === '済') sh.deleteRow(i + 2);
  });
}

/** 保証期限を登録・更新（id があれば更新、fileId が同じものがあればそれを更新） */
function setWarranty_(w) {
  const name = clean_(w && w.name, 60);
  const date = fmtDate_(w && w.date);
  if (!name) throw err_('品名を入れてください。');
  if (!date) throw err_('保証期限の日付を入れてください。');
  const ss = kurashi_();
  lock_(() => {
    const sh = ss.getSheetByName('保証');
    let row = w.id ? findRow_(sh, 4, w.id) : -1;
    if (row < 0 && w.fileId) row = findRow_(sh, 2, w.fileId);
    const vals = [name, date.replace(/-/g, '/'), clean_(w.fileId, 80), clean_(w.memo, 100)];
    if (row > 0) sh.getRange(row, 1, 1, 4).setValues([vals]);
    else sh.appendRow(vals.concat([newId_()]));
  });
  return warrantyData_(ss);
}
function deleteWarranty_(id) {
  const ss = kurashi_();
  lock_(() => { const sh = ss.getSheetByName('保証'); const row = findRow_(sh, 4, id); if (row > 0) sh.deleteRow(row); });
  return warrantyData_(ss);
}

/* =========================================================
 * お金：プロジェクトを追加（旅行・家具の買い替え など）
 * ======================================================= */

function addProject_(me, p) {
  const name = clean_(p && p.name, 40);
  if (!name) throw err_('プロジェクト名を入れてください。');
  if (me.conf.projects.some(x => x.name === name)) throw err_('同じ名前のプロジェクトがあります。');
  const b0 = Math.round(Number(p.budget0) || 0), b1 = Math.round(Number(p.budget1) || 0);
  if (b0 < 0 || b1 < 0) throw err_('予算は0以上で入れてください。');
  return moneyWrite_(me, ss => {
    const sh = ss.getSheetByName(SH.conf);
    const col = sh.getRange(2, 1, Math.max(sh.getLastRow(), 2), 1).getValues();
    let row = col.findIndex(r => String(r[0]).trim() === '') + 2;
    if (row < 2) row = col.length + 2;
    sh.getRange(row, 1, 1, 5).setValues([[name, '進行中', Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd'), b0, b1]]);
    sh.getRange(row, 7).setValue(clean_(p.note, 100));
  });
}

function setProjectStatus_(me, name, status) {
  const st = ['進行中', '予定', '完了'].indexOf(status) >= 0 ? status : '進行中';
  return moneyWrite_(me, ss => {
    const sh = ss.getSheetByName(SH.conf);
    const col = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    const i = col.findIndex(r => String(r[0]).trim() === String(name));
    if (i < 0) throw err_('このプロジェクトは見つかりませんでした。');
    sh.getRange(i + 2, 2).setValue(st);
  });
}

/* =========================================================
 * 固定費（共通口座）
 * ======================================================= */

function fixed_() { return SpreadsheetApp.openById(FIXED_ID); }

function fixedData_(me) {
  const ss = fixed_();
  const items = readRows_(ss.getSheetByName('項目'), 8, 7, r => r[0] !== '').map(r => ({
    id: String(r[7]), name: String(r[0]), category: String(r[1] || ''), amount: Number(r[2]) || 0,
    day: r[3] === '' ? '' : Number(r[3]) || '', variable: r[4] === true, active: String(r[5]) !== 'やめた', memo: String(r[6] || '')
  }));
  const records = readRows_(ss.getSheetByName('記録'), 7, 6, r => r[0] !== '').map(r => ({
    id: String(r[6]), month: monthStr_(r[0]), itemId: String(r[1]), item: String(r[2]),
    amount: Number(r[3]) || 0, status: String(r[4] || '予定'), memo: String(r[5] || '')
  }));
  const deposits = readRows_(ss.getSheetByName('入金'), 6, 5, r => r[3] !== '').map(r => ({
    id: String(r[5]), date: fmtDate_(r[0]), month: monthStr_(r[1]) || monthStr_(r[0]), who: String(r[2]),
    amount: Number(r[3]) || 0, memo: String(r[4] || '')
  }));
  const conf = ss.getSheetByName('設定').getRange(2, 1, 29, 4).getValues();
  const ratio = {}, allowance = {};
  conf.forEach(r => {
    const n = String(r[0]).trim();
    if (!n) return;
    ratio[n] = Number(r[1]) || 0;
    allowance[n] = Number(r[2]) || 0;
  });
  const extras = readRows_(ss.getSheetByName('臨時のお小遣い'), 6, 5, r => r[3] !== '').map(r => ({
    id: String(r[5]), date: fmtDate_(r[0]), month: monthStr_(r[1]) || monthStr_(r[0]), who: String(r[2]),
    amount: Number(r[3]) || 0, reason: String(r[4] || '')
  }));
  const balances = readRows_(ss.getSheetByName('残高'), 6, 4, r => r[0] !== '').map(r => {
    let snap = null;
    try { snap = r[5] ? JSON.parse(r[5]) : null; } catch (e) {}
    return { id: String(r[4]), month: monthStr_(r[0]), end: r[1] === '' ? null : Number(r[1]), start: r[2] === '' ? null : Number(r[2]), memo: String(r[3] || ''), allowance: snap };
  });
  const categories = conf.map(r => String(r[3]).trim()).filter(Boolean);
  return {
    items: items, records: records, deposits: deposits, ratio: ratio, allowance: allowance, extras: extras, balances: balances, categories: categories,
    thisMonth: Utilities.formatDate(new Date(), TZ, 'yyyy-MM'),
    today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), sheetUrl: ss.getUrl()
  };
}

function addFixedItem_(me, it) {
  const name = clean_(it && it.name, 40);
  if (!name) throw err_('項目名を入れてください。');
  const amount = Math.round(Number(it.amount) || 0);
  if (amount < 0) throw err_('金額は0以上で入れてください。');
  const day = it.day === '' || it.day == null ? '' : Math.min(31, Math.max(1, Math.round(Number(it.day)) || 1));
  return fixedWrite_(me, ss => {
    ss.getSheetByName('項目').appendRow([name, clean_(it.category, 20), amount, day, !!it.variable, '使う', clean_(it.memo, 100), newId_()]);
  });
}

function updateFixedItem_(me, id, f) {
  return fixedWrite_(me, ss => {
    const sh = ss.getSheetByName('項目');
    const row = findRow_(sh, 7, id);
    if (row < 0) throw err_('この項目は見つかりませんでした。画面を更新してください。');
    if ('name' in f) { const n = clean_(f.name, 40); if (!n) throw err_('項目名を入れてください。'); sh.getRange(row, 1).setValue(n); }
    if ('category' in f) sh.getRange(row, 2).setValue(clean_(f.category, 20));
    if ('amount' in f) sh.getRange(row, 3).setValue(Math.max(0, Math.round(Number(f.amount) || 0)));
    if ('day' in f) sh.getRange(row, 4).setValue(f.day === '' ? '' : Math.min(31, Math.max(1, Math.round(Number(f.day)) || 1)));
    if ('variable' in f) sh.getRange(row, 5).setValue(!!f.variable);
    if ('active' in f) sh.getRange(row, 6).setValue(f.active ? '使う' : 'やめた');
    if ('memo' in f) sh.getRange(row, 7).setValue(clean_(f.memo, 100));
  });
}

/** その月のその項目の金額・状態を記録（なければ追加） */
function setFixedRecord_(me, month, itemId, amount, status) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw err_('月の指定が正しくありません。');
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  const st = status === '引き落とし済み' ? '引き落とし済み' : '予定';
  return fixedWrite_(me, ss => {
    const items = ss.getSheetByName('項目');
    const irow = findRow_(items, 7, itemId);
    if (irow < 0) throw err_('この項目は見つかりませんでした。画面を更新してください。');
    const itemName = items.getRange(irow, 1).getValue();
    const sh = ss.getSheetByName('記録');
    const last = sh.getLastRow();
    let row = -1;
    if (last >= 2) {
      const v = sh.getRange(2, 1, last - 1, 2).getValues();
      for (let i = 0; i < v.length; i++) if (monthStr_(v[i][0]) === month && String(v[i][1]) === String(itemId)) { row = i + 2; break; }
    }
    if (row > 0) sh.getRange(row, 3, 1, 3).setValues([[itemName, amt, st]]);
    else sh.appendRow(["'" + month, itemId, itemName, amt, st, '', newId_()]);
  });
}

function addDeposit_(me, d) {
  const amount = Math.round(Number(d && d.amount));
  if (!(amount > 0)) throw err_('金額を1円以上で入れてください。');
  if (!/^\d{4}-\d{2}$/.test(String(d.month))) throw err_('月の指定が正しくありません。');
  return fixedWrite_(me, ss => {
    const date = fmtDate_(d.date) || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    ss.getSheetByName('入金').appendRow([date.replace(/-/g, '/'), "'" + d.month, clean_(d.who, 20), amount, clean_(d.memo, 100), newId_()]);
  });
}

function deleteDeposit_(me, id) {
  return fixedWrite_(me, ss => {
    const sh = ss.getSheetByName('入金');
    const row = findRow_(sh, 5, id);
    if (row > 0) sh.deleteRow(row);
  });
}

function setRatio_(me, ratio) {
  return fixedWrite_(me, ss => {
    const sh = ss.getSheetByName('設定');
    const v = sh.getRange(2, 1, 10, 2).getValues();
    v.forEach((r, i) => {
      const n = String(r[0]).trim();
      if (n && ratio && n in ratio) sh.getRange(i + 2, 2).setValue(Math.max(0, Math.min(100, Math.round(Number(ratio[n]) || 0))));
    });
  });
}

function addExtra_(me, x) {
  const amount = Math.round(Number(x && x.amount));
  if (!(amount > 0)) throw err_('金額を1円以上で入れてください。');
  if (!/^\d{4}-\d{2}$/.test(String(x.month))) throw err_('月の指定が正しくありません。');
  return fixedWrite_(me, ss => {
    const date = fmtDate_(x.date) || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    ss.getSheetByName('臨時のお小遣い').appendRow([date.replace(/-/g, '/'), "'" + x.month, clean_(x.who, 20), amount, clean_(x.reason, 60), newId_()]);
  });
}

function deleteExtra_(me, id) {
  return fixedWrite_(me, ss => {
    const sh = ss.getSheetByName('臨時のお小遣い');
    const row = findRow_(sh, 5, id);
    if (row > 0) sh.deleteRow(row);
  });
}

/** その月の月末残高と月初残高（前の月の記録がないときだけ使う）を記録。両方とも毎回送る */
function setBalance_(me, month, end, start) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw err_('月の指定が正しくありません。');
  const num = v => (v === '' || v == null) ? '' : Math.round(Number(v));
  const e = num(end), st = num(start);
  if ((e !== '' && isNaN(e)) || (st !== '' && isNaN(st))) throw err_('残高は数字で入れてください。');
  return fixedWrite_(me, ss => {
    // 月末残高を入れた時点のお小遣いの額を記録しておく（あとで額を変えても過去の月の計算が変わらないように）
    const snap = {};
    ss.getSheetByName('設定').getRange(2, 1, 10, 3).getValues().forEach(r => { if (String(r[0]).trim()) snap[String(r[0]).trim()] = Number(r[2]) || 0; });
    const snapText = e === '' ? '' : JSON.stringify(snap);
    const sh = ss.getSheetByName('残高');
    const last = sh.getLastRow();
    let row = -1;
    if (last >= 2) {
      const v = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < v.length; i++) if (monthStr_(v[i][0]) === month) { row = i + 2; break; }
    }
    if (row > 0) {
      sh.getRange(row, 2, 1, 2).setValues([[e, st]]);
      sh.getRange(row, 6).setValue(snapText);
    } else {
      sh.appendRow(["'" + month, e, st, '', newId_(), snapText]);
    }
  });
}

function setAllowance_(me, amounts) {
  return fixedWrite_(me, ss => {
    const sh = ss.getSheetByName('設定');
    const v = sh.getRange(2, 1, 10, 1).getValues();
    v.forEach((r, i) => {
      const n = String(r[0]).trim();
      if (n && amounts && n in amounts) sh.getRange(i + 2, 3).setValue(Math.max(0, Math.round(Number(amounts[n]) || 0)));
    });
  });
}

function fixedWrite_(me, fn) {
  const ss = fixed_();
  lock_(() => fn(ss));
  return fixedData_(me);
}

function monthStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM');
  const m = String(v || '').match(/(\d{4})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
}

/* =========================================================
 * 書類・写真（ドライブのフォルダ）
 * ======================================================= */

function fileInfo_(f) {
  const mime = f.getMimeType();
  return {
    id: f.getId(), name: f.getName(), mime: mime, size: f.getSize(),
    updated: Utilities.formatDate(f.getLastUpdated(), TZ, 'yyyy-MM-dd'),
    kind: /^image\//.test(mime) ? 'image' : (mime === 'application/pdf' ? 'pdf' : 'other'),
    url: f.getUrl()
  };
}

function listFiles_(folder) {
  const out = [], it = folder.getFiles();
  while (it.hasNext()) out.push(it.next());
  return out.sort((a, b) => b.getDateCreated() - a.getDateCreated());
}

function docsData_() {
  const root = DriveApp.getFolderById(FOLDERS.docs);
  const cats = [], it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    cats.push({ id: f.getId(), name: f.getName(), files: listFiles_(f).map(fileInfo_) });
  }
  cats.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const loose = listFiles_(root).map(fileInfo_);
  if (loose.length) cats.push({ id: root.getId(), name: '未分類', files: loose });
  return { categories: cats, folderUrl: root.getUrl() };
}

function uploadDoc_(folderId, name, dataUrl) {
  const folder = DriveApp.getFolderById(folderId);
  if (folderId !== FOLDERS.docs && !isUnder_(folder, [FOLDERS.docs])) throw err_('このフォルダには保存できません。');
  const blob = blobFromDataUrl_(dataUrl, name, /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/, 15);
  folder.createFile(blob);
  return docsData_();
}

function addFolder_(parentId, name, after) {
  const n = clean_(name, 40).replace(/^'/, '').replace(/[\\\/:*?"<>|]/g, '');
  if (!n) throw err_('名前を入れてください。');
  const parent = DriveApp.getFolderById(parentId);
  if (parent.getFoldersByName(n).hasNext()) throw err_('同じ名前がすでにあります。');
  parent.createFolder(n);
  return after();
}

function albumsData_() {
  const root = DriveApp.getFolderById(FOLDERS.photos);
  const albums = [], it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getId() === FOLDERS.homePhotos) continue;
    const imgs = listFiles_(f).filter(x => /^image\//.test(x.getMimeType()));
    albums.push({ id: f.getId(), name: f.getName(), count: imgs.length, cover: imgs.length ? thumb_(imgs[0]) : null });
  }
  albums.sort((a, b) => b.name.localeCompare(a.name, 'ja'));
  return { albums: albums, folderUrl: root.getUrl() };
}

function albumData_(id) {
  const folder = DriveApp.getFolderById(id);
  if (!isUnder_(folder, [FOLDERS.photos]) || id === FOLDERS.homePhotos) throw err_('このアルバムは開けません。');
  const imgs = listFiles_(folder).filter(x => /^image\//.test(x.getMimeType())).slice(0, 120);
  return {
    id: id, name: folder.getName(), url: folder.getUrl(),
    photos: imgs.map(f => ({ id: f.getId(), name: f.getName(), date: Utilities.formatDate(f.getDateCreated(), TZ, 'yyyy-MM-dd'), thumb: thumb_(f) }))
  };
}

function uploadPhoto_(albumId, dataUrl, name) {
  const folder = DriveApp.getFolderById(albumId);
  if (!isUnder_(folder, [FOLDERS.photos]) || albumId === FOLDERS.homePhotos) throw err_('このアルバムには保存できません。');
  const f = folder.createFile(blobFromDataUrl_(dataUrl, name, /^image\/(jpeg|png|webp)$/, 4));
  return { id: f.getId(), name: f.getName(), date: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), thumb: thumb_(f) };
}

function setHomeFromPhoto_(id) {
  const f = DriveApp.getFileById(id);
  if (!isUnder_(f, [FOLDERS.photos])) throw err_('この写真は使えません。');
  if (f.getSize() > PHOTO_MAX_BYTES) throw err_('写真が大きすぎてホームに使えません。');
  f.makeCopy('home-' + f.getName(), DriveApp.getFolderById(FOLDERS.homePhotos));
  return true;
}

function fileData_(id) {
  const f = DriveApp.getFileById(id);
  if (!isUnder_(f, [FOLDERS.docs, FOLDERS.photos])) throw err_('このファイルは開けません。');
  if (f.getSize() > 15 * 1024 * 1024) throw err_('ファイルが大きすぎてアプリでは開けません。ドライブで開いてください。', 'too_large');
  const b = f.getBlob();
  return { name: f.getName(), mime: b.getContentType(), dataUrl: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()), url: f.getUrl() };
}

function trashFile_(id) {
  const f = DriveApp.getFileById(id);
  if (!isUnder_(f, [FOLDERS.docs, FOLDERS.photos])) throw err_('このファイルは削除できません。');
  f.setTrashed(true);   // ドライブのゴミ箱へ（30日以内なら戻せる）
  return true;
}

function thumb_(f) {
  try {
    const b = f.getThumbnail();
    if (b) return 'data:' + (b.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(b.getBytes());
  } catch (e) {}
  if (f.getSize() <= 400 * 1024 && /^image\//.test(f.getMimeType())) {
    const b = f.getBlob();
    return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
  }
  return null;
}

/** item（ファイルかフォルダ）が roots のどれかの下にあるか */
function isUnder_(item, roots) {
  let level = [item];
  for (let depth = 0; depth < 6 && level.length; depth++) {
    const next = [];
    level.forEach(x => {
      const it = x.getParents();
      while (it.hasNext()) next.push(it.next());
    });
    if (next.some(p => roots.indexOf(p.getId()) >= 0)) return true;
    level = next;
  }
  return false;
}

function blobFromDataUrl_(dataUrl, name, mimeOk, maxMb) {
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!m || !mimeOk.test(m[1])) throw err_('このファイルの種類は保存できません。写真かPDFを選んでください。');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > maxMb * 1024 * 1024) throw err_('ファイルが大きすぎます（' + maxMb + 'MBまで）。');
  const n = String(name || 'file').slice(0, 80).replace(/[\\\/:*?"<>|]/g, '');
  return Utilities.newBlob(bytes, m[1], n);
}

/* =========================================================
 * 機密（暗号化はスマホの中で行い、ここでは暗号化済みの文字を預かるだけ）
 * ======================================================= */

function vaultFile_() {
  const it = DriveApp.getFolderById(FOLDERS.secret).getFilesByName(VAULT_NAME);
  return it.hasNext() ? it.next() : null;
}

function getVault_() {
  const f = vaultFile_();
  if (!f) return { exists: false, version: 0 };
  return { exists: true, text: f.getBlob().getDataAsString(), version: Number(f.getDescription() || 0) };
}

function saveVault_(me, text, baseVersion) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw err_('保存するデータが正しくありません。'); }
  if (!obj || !obj.salt || !obj.iv || !obj.ct) throw err_('保存するデータが正しくありません。');
  if (String(text).length > 2 * 1024 * 1024) throw err_('データが大きすぎます。');
  let version = 0;
  lock_(() => {
    let f = vaultFile_();
    const current = f ? Number(f.getDescription() || 0) : 0;
    if (current !== Number(baseVersion || 0)) throw err_('もう一人が先に保存しました。一度閉じて開き直してください。', 'conflict');
    if (f) f.setContent(text);
    else f = DriveApp.getFolderById(FOLDERS.secret).createFile(VAULT_NAME, text, MimeType.PLAIN_TEXT);
    version = current + 1;
    f.setDescription(String(version));
  });
  return { version: version };
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

function moneyWrite_(me, fn) {
  lock_(() => fn(me.ss));
  me.conf = settings_(me.ss, me.email);
  return moneyData_(me);
}

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
  SpreadsheetApp.openById(FIXED_ID).getName();
  DriveApp.getFolderById(FOLDERS.homePhotos).getName();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  Logger.log('準備OK');
}
