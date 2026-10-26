(function(){
var S = {view:'home', me:null, m:null, t:null, folders:{}, project:'', payer:'', pri:'あとででOK',
  confirmExp:null, confirmWish:null, editWish:null, buyWish:null, busy:false,
  tdOwner:'', tdFilter:'すべて', showDone:false, confirmTodo:null};
var OWNERS_BOTH = 'ふたり';
var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function yen(n){ return '¥' + Math.round(n).toLocaleString('ja-JP'); }
function sYen(n){ return n < 0 ? '−' + yen(-n) : yen(n); }
function man(n){ var v = n / 10000; return (Number.isInteger(v) ? v : v.toFixed(1)) + '万円'; }
function md(s){ if(!s) return ''; var p = s.split('-'); return (+p[1]) + '/' + (+p[2]); }
function pct(a,b){ return b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0; }
function mIdx(name){ return S.m ? Math.max(0, S.m.members.indexOf(name)) : 0; }
function ownerCls(o){ if (o === OWNERS_BOTH) return 'both'; var i = S.me ? S.me.members.indexOf(o) : -1; return i >= 0 ? 'm' + i : ''; }

var toastT;
function toast(msg){ var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 2400); }
function banner(msg, isErr){ var b = $('banner'); if (!msg) { b.hidden = true; return; } b.textContent = msg; b.className = 'banner' + (isErr ? ' err' : ''); b.hidden = false; }
/* ---------- 窓口（Apps Script）とのやりとり ---------- */
var CFG = window.FUTARI_CONFIG || {};
var SESSION_KEY = 'futari-session';
function getSession(){ try { return localStorage.getItem(SESSION_KEY) || ''; } catch(e) { return S.sessionMem || ''; } }
function setSession(v){ S.sessionMem = v; try { if (v) localStorage.setItem(SESSION_KEY, v); else localStorage.removeItem(SESSION_KEY); } catch(e) {} }

function api(action){
  var args = Array.prototype.slice.call(arguments, 1);
  var body = {action:action, args:args, session:getSession()};
  if (action === 'login') body = {action:'login', idToken:args[0]};
  return fetch(CFG.apiUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body), redirect:'follow'})
    .catch(function(){ throw new Error('通信できませんでした。電波の状態を確認してください。'); })
    .then(function(r){ return r.json().catch(function(){ throw new Error('窓口から正しい返事がありませんでした。'); }); })
    .then(function(res){
      if (res.ok) { if (action !== 'login' && action !== 'logout') setTimeout(saveCache, 0); return res.data; }
      if (res.code === 'auth' || res.code === 'forbidden') { setSession(''); clearLocal(); showLogin(res.error); }
      var e = new Error(res.error || 'うまくいきませんでした。'); e.code = res.code; throw e;
    });
}
var call = api;
function errMsg(e){ return (e && e.message ? e.message : String(e)).replace(/^(Error|Exception):\s*/, ''); }
function setBusy(b){ S.busy = b; $('app').classList.toggle('busy', b); }

/* ---------- スマホの中に前回の内容を覚えておく（開いた瞬間に表示するため） ---------- */
var CACHE_KEY = 'futari-cache-v1', PH_PREFIX = 'futari-ph:', PH_INDEX = 'futari-ph-index', PH_LAST = 'futari-ph-last', PH_KEEP = 3;
function lsGet(k){ try { return localStorage.getItem(k); } catch(e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch(e) { return false; } }
function lsDel(k){ try { localStorage.removeItem(k); } catch(e) {} }
function saveCache(){
  if (!S.m || !S.me) return;
  lsSet(CACHE_KEY, JSON.stringify({me:S.me, money:S.m, todos:S.t, fixed:S.f, home:S.h, folders:S.folders, at:Date.now()}));
}
function readCache(){ try { return JSON.parse(lsGet(CACHE_KEY) || 'null'); } catch(e) { return null; } }
function clearLocal(){
  lsDel(CACHE_KEY); lsDel(PH_LAST); lsDel('futari-cal-up'); S.up = null; S.calCache = {};
  var idx = []; try { idx = JSON.parse(lsGet(PH_INDEX) || '[]'); } catch(e) {}
  idx.forEach(function(id){ lsDel(PH_PREFIX + id); }); lsDel(PH_INDEX);
}

function runMoney(fn, args, okMsg){
  setBusy(true);
  return call.apply(null, [fn].concat(args)).then(function(d){ S.m = d; setBusy(false); renderMoney(); if (okMsg) toast(okMsg); })
    .catch(function(e){ setBusy(false); toast(errMsg(e) || '保存できませんでした。もう一度お試しください。'); });
}
function runTodo(fn, args, okMsg){
  setBusy(true);
  return call.apply(null, [fn].concat(args)).then(function(d){ S.t = d; setBusy(false); renderTodo(); if (okMsg) toast(okMsg); })
    .catch(function(e){ setBusy(false); toast(errMsg(e) || '保存できませんでした。もう一度お試しください。'); });
}

/* ---------- 画面の切り替え ---------- */
var VIEWS = ['home','money','project','fixed','todo','shop','cal','docs','photos','album','secret'];
function parseHash(){
  var h = decodeURIComponent((location.hash || '').replace('#', ''));
  var parts = h.split('/'), v = parts[0];
  return {view: VIEWS.indexOf(v) >= 0 ? v : 'home', param: parts.slice(1).join('/')};
}
function viewFromHash(){ return parseHash().view; }
function show(view, param){
  if (S.view === 'secret' && view !== 'secret') lockVault();
  S.view = view; S.param = param || '';
  $('v-login').hidden = true;
  VIEWS.forEach(function(v){ $('v-' + v).hidden = v !== view; });
  closeViewer();
  if (view === 'home') renderHome();
  if (view === 'money') renderMoneyHub();
  if (view === 'project') { if (S.param) S.project = S.param; renderMoney(); }
  if (view === 'fixed') renderFixed();
  if (view === 'todo') renderTodo();
  if (view === 'shop') renderShop();
  if (view === 'cal') openCal();
  if (view === 'docs') openDocs();
  if (view === 'photos') openPhotos();
  if (view === 'album') openAlbum(S.param);
  if (view === 'secret') openSecret();
  window.scrollTo(0, 0);
}
function go(view, param){
  var target = view === 'home' ? '' : view + (param ? '/' + encodeURIComponent(param) : '');
  if ((location.hash || '').replace('#', '') === target) show(view, param); else location.hash = target;
}
window.addEventListener('hashchange', function(){ if (S.m) { var h = parseHash(); show(h.view, h.param); } });

/* ---------- ログイン ---------- */
function showLogin(msg){
  S.m = null;
  VIEWS.forEach(function(v){ $('v-' + v).hidden = true; });
  banner(null);
  $('v-login').hidden = false;
  $('login-msg').textContent = msg || '';
  $('login-msg').hidden = !msg;
  var inApp = /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/.test(navigator.userAgent || '');
  $('inapp-note').hidden = !inApp;
  renderGoogleButton();
}
function renderGoogleButton(){
  if (!window.google || !google.accounts || !google.accounts.id) { S.wantButton = true; return; }
  if (!S.gisReady) {
    google.accounts.id.initialize({client_id: CFG.clientId, callback: onCredential, auto_select: true, itp_support: true, use_fedcm_for_prompt: true});
    S.gisReady = true;
  }
  var holder = $('g-button'); holder.innerHTML = '';
  google.accounts.id.renderButton(holder, {theme:'outline', size:'large', shape:'pill', text:'signin_with', locale:'ja', width: Math.min(320, holder.clientWidth || 320)});
}
window.onGoogleLibraryLoad = function(){ if (S.wantButton || !$('v-login').hidden) renderGoogleButton(); };
function onCredential(resp){
  $('login-msg').hidden = true;
  setBusy(true);
  api('login', resp.credential).then(function(d){
    setSession(d.session); setBusy(false); loadAll();
  }).catch(function(e){ setBusy(false); $('login-msg').textContent = errMsg(e); $('login-msg').hidden = false; });
}
function logout(){
  var done = function(){ setSession(''); clearLocal(); try { google.accounts.id.disableAutoSelect(); } catch(e) {} S.photoAsked = false; S.photo = null; renderPhoto(); showLogin('ログアウトしました。'); };
  api('logout').then(done, done);
}

/* ---------- 読み込み ---------- */
function applyData(d){
  var first = !S.m;
  S.me = d.me; S.m = d.money; S.t = d.todos; S.f = d.fixed; S.h = d.home; S.folders = d.folders; banner(null);
  if (!S.fxMonth) S.fxMonth = S.f.thisMonth;
  var names = S.m.projects.map(function(p){ return p.name; });
  if (names.indexOf(S.project) < 0) {
    var active = S.m.projects.filter(function(p){ return p.status === '進行中'; })[0];
    S.project = active ? active.name : (names[0] || '');
  }
  if (!S.payer || S.m.members.indexOf(S.payer) < 0) S.payer = S.m.meMember || S.m.members[0] || '';
  if (!S.tdOwner) S.tdOwner = S.me.member || OWNERS_BOTH;
  // 入力中のフォームがあるときは、選択肢を作り直さない（選んだものが戻ってしまうため）
  if (first || !document.querySelector('form.form:not([hidden])')) buildStatic();
  if (first) { var h = parseHash(); show(h.view, h.param); } else rerender();
}
/** 今の画面だけ描き直す（スクロール位置はそのまま） */
function rerender(){
  var v = S.view;
  if (v === 'home') renderHome();
  else if (v === 'money') renderMoneyHub();
  else if (v === 'project') renderMoney();
  else if (v === 'fixed') renderFixed();
  else if (v === 'todo') renderTodo();
  else if (v === 'shop') renderShop();
  else if (v === 'cal') renderCal();
}
function loadAll(fresh){
  if (!getSession()) { showLogin(); return Promise.resolve(); }
  if (!S.m) { var c = readCache(); if (c && c.money && c.me) applyData(c); }
  if (!S.photoAsked) { S.photoAsked = true; startPhoto(); }
  loadUpcoming();
  return call('getAll', fresh ? {fresh:true} : {}).then(applyData).catch(function(e){
    if (e && (e.code === 'auth' || e.code === 'forbidden')) return;
    if (S.m) toast('最新の内容を読み込めませんでした。' + errMsg(e));
    else banner('読み込めませんでした。' + errMsg(e), true);
  });
}

function buildStatic(){
  var m = S.m;
  var opts = m.categories.map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('');
  $('ex-cat').innerHTML = opts; $('wi-cat').innerHTML = opts;
  $('ex-payer').innerHTML = m.members.map(function(n, i){ return '<button type="button" class="m' + i + '" data-payer="' + esc(n) + '" aria-pressed="' + (n === S.payer) + '">' + esc(n) + '</button>'; }).join('');
  var owners = S.me.members.concat([OWNERS_BOTH]);
  $('td-owner').innerHTML = owners.map(function(o){ return '<button type="button" class="' + ownerCls(o) + '" data-owner="' + esc(o) + '" aria-pressed="' + (o === S.tdOwner) + '">' + esc(o) + '</button>'; }).join('');
  $('td-filters').innerHTML = ['すべて'].concat(owners).map(function(o){ return '<button type="button" data-filter="' + esc(o) + '" aria-pressed="' + (o === S.tdFilter) + '">' + esc(o) + '</button>'; }).join('');
  $('money-sheet-link').innerHTML = '<a href="' + esc(m.sheetUrl) + '" target="_blank" rel="noopener">台帳をスプレッドシートで開く</a>';
  $('todo-sheet-link').innerHTML = '<a href="' + esc(S.t.sheetUrl) + '" target="_blank" rel="noopener">やることをスプレッドシートで開く</a>';
  $('root-link').href = S.folders.root;
  if (S.h) $('cal-sheet-link').href = S.h.sheetUrl;
  $('pj-b0-label').textContent = (m.members[0] || '') + 'の予算（円）';
  $('pj-b1-label').textContent = (m.members[1] || '') + 'の予算（円）';
  $('it-cat').innerHTML = S.f.categories.map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('');
  $('dep-who').innerHTML = m.members.map(function(n, i){ return '<button type="button" class="m' + i + '" data-depwho="' + esc(n) + '" aria-pressed="' + (n === (S.depWho || S.me.member || m.members[0])) + '">' + esc(n) + '</button>'; }).join('');
  if (!S.depWho) S.depWho = S.me.member || m.members[0];
  if (!S.exWho) S.exWho = S.me.member || m.members[0];
  $('ex2-who').innerHTML = m.members.map(function(n, i){ return '<button type="button" class="m' + i + '" data-exwho="' + esc(n) + '" aria-pressed="' + (n === S.exWho) + '">' + esc(n) + '</button>'; }).join('');
  $('fixed-sheet-link').innerHTML = '<a href="' + esc(S.f.sheetUrl) + '" target="_blank" rel="noopener">共通口座の表をスプレッドシートで開く</a>';
}

/* ---------- ホーム ---------- */
function renderHome(){
  if (!S.m) return;
  renderClock();

  var M = S.m.members;
  var fx = fixedMonth(S.f.thisMonth);
  var actives = S.m.projects.filter(function(p){ return p.status !== '完了'; });
  var pfx = fixedMonth(shiftMonth(S.f.thisMonth, -1));
  var rows = '<div class="t-row"><span class="l">共通口座 ' + (+S.f.thisMonth.split('-')[1]) + '月の固定費</span><b class="num">' + yen(fx.total) + '</b></div>';
  if (pfx.living != null) rows += '<div class="t-row"><span class="l">' + (+pfx.month.split('-')[1]) + '月の生活費</span><b class="num">' + yen(pfx.living) + '</b></div>';
  rows += actives.slice(0, 3).map(function(p){
    var tt = projTotals(p.name), l = tt.total - tt.used;
    return '<div class="t-row"><span class="l">' + esc(p.name) + ' の残り</span><b class="num' + (l < 0 ? ' over' : '') + '">' + sYen(l) + '</b></div>';
  }).join('');
  $('tile-money').innerHTML =
    '<div class="t-head"><span class="t-name">お金</span><span class="t-go">開く →</span></div>' +
    '<div class="t-rows">' + rows + '</div>';
  $('tile-secret-state').textContent = S.vault && S.vault.key ? '🔓 開いています' : '🔒 ロック中';

  var open = openTodos(), today = S.t.today;
  var over = open.filter(function(x){ return x.due && x.due < today; }).length;
  $('tile-todo').innerHTML =
    '<div class="t-head"><span class="t-name">やること</span><span class="t-go">→</span></div>' +
    '<div class="t-big num">' + open.length + '<span class="t-sub" style="font-size:12px;margin-left:4px">件' + (over ? '・期限切れ' + over : '') + '</span></div>' +
    (open.length ? '<div class="mini-list">' + open.slice(0, 2).map(function(x){ return '<div>' + esc(x.title) + '</div>'; }).join('') + '</div>' : '<div class="t-sub">全部終わりました</div>');
  var shopOpen = S.h ? S.h.shop.filter(function(x){ return !x.done; }) : [];
  $('tile-shop').innerHTML =
    '<div class="t-head"><span class="t-name">買い物</span><span class="t-go">→</span></div>' +
    '<div class="t-big num">' + shopOpen.length + '<span class="t-sub" style="font-size:12px;margin-left:4px">品</span></div>' +
    (shopOpen.length ? '<div class="mini-list">' + shopOpen.slice(0, 2).map(function(x){ return '<div>' + esc(x.name) + '</div>'; }).join('') + '</div>' : '<div class="t-sub">買うものはありません</div>');
  renderNotices();
  renderCalTile();
}

function renderClock(){
  if (!S.me) return;
  var d = new Date(), h = d.getHours();
  var hello = h >= 6 && h < 10 ? 'おはよう ☀️' : (h >= 10 && h < 18 ? 'こんにちは ☀️' : 'こんばんは 🌙');
  $('greet-title').textContent = (S.me.member ? S.me.member + '、' : '') + hello;
  $('greet-time').textContent = ('0' + h).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  var day = d.getDay(), cls = day === 0 ? ' sun' : (day === 6 ? ' sat' : '');
  $('greet-date').innerHTML = (d.getMonth() + 1) + '月' + d.getDate() + '日' +
    '<span class="wd' + cls + '">' + '日月火水木金土'.charAt(day) + '曜日</span>';
}
setInterval(function(){ if (S.view === 'home') renderClock(); }, 10000);

/* ---------- ホームの写真 ---------- */
function renderPhoto(){
  var img = $('hero-img'), card = $('hero-card');
  if (S.photo && S.photo.dataUrl) {
    img.src = S.photo.dataUrl; img.hidden = false; card.classList.add('has-photo');
    $('photo-btn').textContent = '写真を追加';
  } else {
    img.hidden = true; img.removeAttribute('src'); card.classList.remove('has-photo');
  }
}
function phIndex(){ try { return JSON.parse(lsGet(PH_INDEX) || '[]'); } catch(e) { return []; } }
function phStore(id, dataUrl){
  var idx = phIndex().filter(function(x){ return x !== id; });
  idx.push(id);
  while (idx.length > PH_KEEP) lsDel(PH_PREFIX + idx.shift());
  if (!lsSet(PH_PREFIX + id, dataUrl)) {
    while (idx.length > 1) lsDel(PH_PREFIX + idx.shift());
    if (!lsSet(PH_PREFIX + id, dataUrl)) idx = [];
  }
  lsSet(PH_INDEX, JSON.stringify(idx));
}
function phShow(id, dataUrl){ S.photo = {id:id, dataUrl:dataUrl}; renderPhoto(); }
/** 前回の写真をすぐ出し、次に開いたとき用の写真を裏で用意しておく */
function startPhoto(){
  var last = lsGet(PH_LAST), lastData = last ? lsGet(PH_PREFIX + last) : null;
  if (lastData) phShow(last, lastData);
  api('getHomePhotoList').then(function(list){
    var ids = (list || []).map(function(x){ return x.id; });
    if (!ids.length) { S.photo = null; renderPhoto(); lsDel(PH_LAST); return; }
    if (S.photo && ids.indexOf(S.photo.id) < 0) { S.photo = null; renderPhoto(); }
    var others = ids.filter(function(x){ return !S.photo || x !== S.photo.id; });
    var pick = (others.length ? others : ids)[Math.floor(Math.random() * (others.length || ids.length))];
    var cached = lsGet(PH_PREFIX + pick);
    var use = function(du){ phStore(pick, du); lsSet(PH_LAST, pick); if (!S.photo) phShow(pick, du); };
    if (cached) use(cached);
    else api('getPhoto', pick).then(function(p){ if (p && p.dataUrl) use(p.dataUrl); }).catch(function(){});
  }).catch(function(){});
}
function shrinkImage(file, maxSide, quality){
  return new Promise(function(res, rej){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('この写真は読み込めませんでした。')); };
    img.src = url;
  });
}
$('photo-btn').addEventListener('click', function(){ if (!S.busy && S.m) $('photo-input').click(); });
$('photo-input').addEventListener('change', function(){
  var f = this.files && this.files[0]; this.value = '';
  if (!f) return;
  setBusy(true); toast('写真を保存しています…');
  shrinkImage(f, 1200, 0.8).then(function(dataUrl){ return call('uploadHomePhoto', dataUrl, f.name); })
    .then(function(p){ phStore(p.id, p.dataUrl); lsSet(PH_LAST, p.id); phShow(p.id, p.dataUrl); setBusy(false); toast('ホームの写真に追加しました'); })
    .catch(function(e){ setBusy(false); toast(errMsg(e) || '写真を保存できませんでした。'); });
});

/* ---------- お金 ---------- */
function proj(){ return S.m.projects.filter(function(p){ return p.name === S.project; })[0] || {budgets:{}, note:''}; }
function exps(){ return S.m.expenses.filter(function(e){ return e.project === S.project; }); }
function wishesAll(){ return S.m.wishes.filter(function(w){ return w.project === S.project; }); }
function wishesOpen(){ return wishesAll().filter(function(w){ return w.status !== '購入済み'; }); }
function projTotals(name){ var keep = S.project; S.project = name; var t = moneyTotals(); S.project = keep; return t; }

/* お金の入り口：固定費とプロジェクトを並べる */
function renderMoneyHub(){
  if (!S.m) return;
  var M = S.m.members, fx = fixedMonth(S.f.thisMonth);
  var dep = (fx.living != null ? '生活費 ' + yen(fx.living) + '・' : '月末の残高はまだ・') + 'お小遣い ' + yen(fx.allowanceTotal + fx.extraTotal);
  $('mh-monthly').innerHTML = '<button class="mcard c-fixed" type="button" data-go="fixed">' +
    '<div class="m-head"><span class="m-name">共通口座</span><span class="m-sub">開く →</span></div>' +
    '<div class="m-sub">' + monthLabel(S.f.thisMonth) + 'の固定費</div>' +
    '<div class="m-big num">' + yen(fx.total) + '</div>' +
    '<div class="bar thin"><span style="width:' + pct(fx.paid, fx.total) + '%;background:var(--fixed-ink)"></span></div>' +
    '<div class="m-sub">' + (fx.lines.length ? '引き落とし済み ' + yen(fx.paid) + '｜' + dep : '家賃や光熱費を登録しましょう') + '</div></button>';
  var card = function(p, done){
    var t = projTotals(p.name), left = t.total - t.used, scale = Math.max(t.total, t.used);
    var segs = M.map(function(n, i){ return '<span class="seg-m' + i + '" style="width:' + pct(t.spent[n], scale) + '%"></span>'; }).join('');
    return '<button class="mcard ' + (done ? 'done' : 'c-money') + '" type="button" data-proj="' + esc(p.name) + '">' +
      '<div class="m-head"><span class="m-name">' + esc(p.name) + '</span><span class="m-sub">' + (done ? '完了' : '開く →') + '</span></div>' +
      (p.note ? '<div class="m-sub">' + esc(p.note) + '</div>' : '') +
      '<div class="m-big num' + (left < 0 ? ' over' : '') + '">' + (done ? yen(t.used) : sYen(left)) + '<span class="m-sub" style="font-size:12px;margin-left:6px">' + (done ? '使った額' : '残り') + ' / 予算 ' + man(t.total) + '</span></div>' +
      '<div class="bar thin">' + segs + '</div></button>';
  };
  var actives = S.m.projects.filter(function(p){ return p.status !== '完了'; });
  var done = S.m.projects.filter(function(p){ return p.status === '完了'; });
  $('mh-projects').innerHTML = actives.length ? actives.map(function(p){ return card(p, false); }).join('') :
    '<div class="list"><div class="empty">進行中のプロジェクトはありません。旅行や家具の買い替えなど、予算を決めて使うときに作りましょう。</div></div>';
  $('mh-toggle-done').hidden = !done.length;
  $('mh-toggle-done').textContent = (S.showDoneProj ? '▾ ' : '▸ ') + '完了したプロジェクト（' + done.length + '）';
  $('mh-done').hidden = !S.showDoneProj || !done.length;
  $('mh-done').innerHTML = done.map(function(p){ return card(p, true); }).join('');
}

function moneyTotals(){
  var spent = {}; S.m.members.forEach(function(n){ spent[n] = 0; });
  exps().forEach(function(e){ if (spent[e.payer] !== undefined) spent[e.payer] += e.amount; });
  var used = 0; for (var k in spent) used += spent[k];
  var open = wishesOpen();
  var planned = open.reduce(function(a, w){ return a + (w.estimate || 0); }, 0);
  var unpriced = open.filter(function(w){ return !(w.estimate > 0); }).length;
  var budgets = proj().budgets, total = 0; for (var b in budgets) total += budgets[b];
  return {spent:spent, used:used, planned:planned, unpriced:unpriced, budgets:budgets, total:total};
}

function renderMoney(){
  if (!S.m) return;
  var pj = S.m.projects.filter(function(p){ return p.name === S.project; })[0];
  if (!pj) { go('money'); return; }
  $('proj-title').textContent = pj.name;
  $('proj-status').innerHTML = pj.status === '完了'
    ? '<span>このプロジェクトは完了しています。</span><button type="button" data-pstatus="進行中">進行中に戻す</button>'
    : '<button type="button" data-pstatus="完了">このプロジェクトを完了にする（お金の画面で下にしまわれます）</button>';
  var t = moneyTotals(), M = S.m.members;
  $('proj-note').textContent = proj().note || '';
  var left = t.total - t.used, after = left - t.planned, scale = Math.max(t.total, t.used + t.planned);
  var segs = M.map(function(n, i){ return '<span class="seg-m' + i + '" style="width:' + pct(t.spent[n], scale) + '%"></span>'; }).join('');
  var leg = M.map(function(n, i){ return '<span><i style="background:var(--m' + i + ')"></i>' + esc(n) + ' ' + yen(t.spent[n]) + '</span>'; }).join('');
  $('hero').innerHTML =
    '<div class="label">予算 ' + man(t.total) + ' のうち、残り</div>' +
    '<div class="big num' + (left < 0 ? ' over' : '') + '">' + sYen(left) + '<small>/ ' + man(t.total) + '</small></div>' +
    '<div class="bar">' + segs + '<span class="seg-plan" style="width:' + pct(t.planned, scale) + '%"></span></div>' +
    '<div class="legend">' + leg + '<span><i class="seg-plan"></i>買いたいもの ' + yen(t.planned) + '</span></div>' +
    '<div class="sub">買いたいものを全部買うと、残り <b class="num' + (after < 0 ? ' over' : '') + '">' + sYen(after) + '</b>' + (t.unpriced ? '（予算未定が' + t.unpriced + '件）' : '') + '</div>';

  $('people').innerHTML = M.map(function(n, i){
    var b = t.budgets[n] || 0, l = b - t.spent[n];
    return '<div class="person"><div class="who"><span class="dot" style="background:var(--m' + i + ')"></span>' + esc(n) + '</div>' +
      '<div class="paid num"><small>出した額</small>' + yen(t.spent[n]) + '</div>' +
      '<div class="mini"><span style="width:' + pct(t.spent[n], b) + '%;background:var(--m' + i + ')"></span></div>' +
      '<div class="left num' + (l < 0 ? ' over' : '') + '">' + (l < 0 ? man(b) + 'を' + yen(-l) + 'オーバー' : '残り ' + yen(l) + ' / ' + man(b)) + '</div></div>';
  }).join('');

  if (M.length === 2) {
    var diff = t.spent[M[0]] - t.spent[M[1]];
    if (Math.abs(diff) < 1) $('balance').innerHTML = t.used ? 'ふたりが出した額は同じです。' : '';
    else {
      var more = diff > 0 ? M[0] : M[1], less = diff > 0 ? M[1] : M[0];
      $('balance').innerHTML = '<b>' + esc(more) + '</b>が <b class="num">' + yen(Math.abs(diff)) + '</b> 多く出しています。半分ずつにするなら、' + esc(less) + 'から' + esc(more) + 'へ <b class="num">' + yen(Math.abs(diff) / 2) + '</b>。';
    }
  } else $('balance').innerHTML = '';

  var ro = exps().sort(function(a, b){ return (b.date || '').localeCompare(a.date || ''); });
  $('exp-list').innerHTML = !ro.length
    ? '<div class="empty">まだ記録がありません。<br>払ったら「＋ 記録する」から追加してください。</div>'
    : ro.map(function(e){
        var c = S.confirmExp === e.id;
        return '<div class="row"><div class="date num">' + esc(md(e.date)) + '</div>' +
          '<div class="main"><div class="title">' + esc(e.item) + '</div><div class="sub"><span class="chip m' + mIdx(e.payer) + '">' + esc(e.payer) + '</span><span>' + esc(e.category) + '</span>' + (e.memo ? '<span>' + esc(e.memo) + '</span>' : '') + '</div></div>' +
          '<div class="amt num">' + yen(e.amount) + '</div>' +
          (c ? '<button class="small-btn danger" data-action="del-exp" data-id="' + esc(e.id) + '">削除</button><button class="small-btn" data-action="cancel">戻す</button>'
             : '<button class="icon-btn" aria-label="' + esc(e.item) + 'を削除" data-action="ask-del-exp" data-id="' + esc(e.id) + '">×</button>') + '</div>';
      }).join('');

  var wo = wishesOpen().sort(function(a, b){ return (a.priority === '入居までに必要' ? 0 : 1) - (b.priority === '入居までに必要' ? 0 : 1); });
  var bought = wishesAll().filter(function(w){ return w.status === '購入済み'; });
  var wl = !wo.length
    ? '<div class="empty">買いたいものはありません。<br>「＋ 追加」から、予算の見込みと一緒にメモできます。</div>'
    : wo.map(function(w){
        var est = w.estimate > 0, estHtml;
        if (S.editWish === w.id) estHtml = '<form class="inline-est" data-form="est" data-id="' + esc(w.id) + '"><input id="est-input" type="number" inputmode="numeric" min="0" step="1" value="' + (est ? w.estimate : '') + '" aria-label="予算（円）"><button class="small-btn" type="submit">保存</button></form>';
        else estHtml = '<button class="est-btn num' + (est ? '' : ' unset') + '" data-action="edit-est" data-id="' + esc(w.id) + '">' + (est ? yen(w.estimate) : '予算を入れる') + '</button>';
        var c = S.confirmWish === w.id;
        var btns = c ? '<button class="small-btn danger" data-action="del-wish" data-id="' + esc(w.id) + '">削除</button><button class="small-btn" data-action="cancel">戻す</button>'
                     : '<button class="small-btn" data-action="buy" data-id="' + esc(w.id) + '">買った</button><button class="icon-btn" aria-label="' + esc(w.item) + 'を削除" data-action="ask-del-wish" data-id="' + esc(w.id) + '">×</button>';
        return '<div class="row"><div class="main"><div class="title">' + esc(w.item) + '</div><div class="sub">' +
          (w.priority === '入居までに必要' ? '<span class="chip must">入居までに必要</span>' : '') +
          '<span>' + esc(w.category) + '</span>' + (w.note ? '<span>' + esc(w.note) + '</span>' : '') + '</div></div>' + estHtml + btns + '</div>';
      }).join('');
  if (bought.length) wl += '<div class="foot">購入済み：' + bought.map(function(w){ return esc(w.item); }).join('、') + '</div>';
  $('wish-list').innerHTML = wl;
  if (S.editWish) { var ei = $('est-input'); if (ei) ei.focus(); }

  var by = {}; S.m.categories.forEach(function(c){ by[c] = {s:0, p:0}; });
  exps().forEach(function(e){ (by[e.category] || (by[e.category] = {s:0, p:0})).s += e.amount; });
  wishesOpen().forEach(function(w){ (by[w.category] || (by[w.category] = {s:0, p:0})).p += (w.estimate || 0); });
  var keys = Object.keys(by).filter(function(k){ return by[k].s || by[k].p; });
  var max = Math.max.apply(null, [1].concat(keys.map(function(k){ return by[k].s + by[k].p; })));
  $('cat-list').innerHTML = !keys.length
    ? '<div class="empty">記録が入ると、どこにお金がかかっているかがここに出ます。</div>'
    : keys.map(function(k){
        return '<div class="cat"><div>' + esc(k || '未分類') + '</div><div class="track"><span class="solid" style="width:' + pct(by[k].s, max) + '%"></span><span class="seg-plan" style="width:' + pct(by[k].p, max) + '%"></span></div>' +
          '<div class="v num">' + yen(by[k].s) + (by[k].p ? '<small>＋予算 ' + yen(by[k].p) + '</small>' : '') + '</div></div>';
      }).join('');
}

function setPayer(p){ S.payer = p; Array.prototype.forEach.call($('ex-payer').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.payer === p)); }); }
function setPri(p){ S.pri = p; Array.prototype.forEach.call($('wi-pri').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.pri === p)); }); }
function openExp(w){
  $('wish-form').hidden = true; $('exp-form').hidden = false; $('ex-err').textContent = '';
  $('ex-item').value = w ? w.item : ''; $('ex-amount').value = w && w.estimate > 0 ? w.estimate : '';
  $('ex-memo').value = w && w.note ? w.note : '';
  if (w && S.m.categories.indexOf(w.category) >= 0) $('ex-cat').value = w.category;
  $('ex-date').value = S.m.today;
  $('exp-form-title').textContent = w ? '「' + w.item + '」を買ったので記録' : '支出を記録';
  $('ex-submit').textContent = w ? '記録して購入済みにする' : '記録する';
  S.buyWish = w ? w.id : null; setPayer(S.payer);
  $('exp-form').scrollIntoView({behavior:'smooth', block:'center'});
  setTimeout(function(){ (w ? $('ex-amount') : $('ex-item')).focus(); }, 250);
}
function closeExp(){ $('exp-form').hidden = true; S.buyWish = null; }

$('exp-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var item = $('ex-item').value.trim(), amount = Math.round(Number($('ex-amount').value));
  if (!item) { $('ex-err').textContent = '項目を入れてください。'; return; }
  if (!(amount > 0)) { $('ex-err').textContent = '金額を1円以上で入れてください。'; return; }
  var e = {project:S.project, item:item, amount:amount, payer:S.payer, category:$('ex-cat').value, date:$('ex-date').value || S.m.today, memo:$('ex-memo').value.trim()};
  var wid = S.buyWish; closeExp();
  if (wid) runMoney('buyWish', [wid, e], '「' + item + '」を購入済みにしました');
  else runMoney('addExpense', [e], S.payer + 'の支出 ' + yen(amount) + ' を記録しました');
});
$('wish-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var item = $('wi-item').value.trim(), raw = $('wi-est').value.trim();
  if (!item) { $('wi-err').textContent = '品名を入れてください。'; return; }
  if (raw !== '' && !(Number(raw) >= 0)) { $('wi-err').textContent = '予算は0以上の数字で入れてください（未定なら空欄）。'; return; }
  $('wish-form').hidden = true;
  runMoney('addWish', [{project:S.project, item:item, note:$('wi-note').value.trim(), estimate:raw, category:$('wi-cat').value, priority:S.pri}], '「' + item + '」を追加しました');
});
['ex-item','ex-amount'].forEach(function(id){ $(id).addEventListener('input', function(){ $('ex-err').textContent = ''; }); });
$('wi-item').addEventListener('input', function(){ $('wi-err').textContent = ''; });


/* ---------- やること ---------- */
function openTodos(){
  return S.t.items.filter(function(x){ return !x.done; }).sort(function(a, b){
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1; if (b.due) return 1; return 0;
  });
}
function setOwner(o){ S.tdOwner = o; Array.prototype.forEach.call($('td-owner').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.owner === o)); }); }

function todoRow(x){
  var today = S.t.today, c = S.confirmTodo === x.id;
  var dueTxt = x.due ? (x.due === today ? '今日まで' : md(x.due) + 'まで') : '';
  return '<div class="row' + (x.done ? ' done' : '') + '">' +
    '<button class="check' + (x.done ? ' on' : '') + '" aria-label="' + esc(x.title) + (x.done ? 'を未完了に戻す' : 'を完了にする') + '" data-action="toggle-todo" data-id="' + esc(x.id) + '">' + (x.done ? '✓' : '') + '</button>' +
    '<div class="main"><div class="title">' + esc(x.title) + '</div><div class="sub">' +
      (x.owner ? '<span class="chip ' + ownerCls(x.owner) + '">' + esc(x.owner) + '</span>' : '') +
      (dueTxt && !x.done ? '<span class="' + (x.due < today ? 'due-over' : '') + '">' + dueTxt + (x.due < today ? '（期限切れ）' : '') + '</span>' : '') +
      (x.done && x.doneAt ? '<span>' + md(x.doneAt) + ' 完了</span>' : '') +
      (x.memo ? '<span>' + esc(x.memo) + '</span>' : '') + '</div></div>' +
    (c ? '<button class="small-btn danger" data-action="del-todo" data-id="' + esc(x.id) + '">削除</button><button class="small-btn" data-action="cancel">戻す</button>'
       : '<button class="icon-btn" aria-label="' + esc(x.title) + 'を削除" data-action="ask-del-todo" data-id="' + esc(x.id) + '">×</button>') + '</div>';
}

function renderTodo(){
  if (!S.t) return;
  var lists = []; S.t.items.forEach(function(x){ if (x.list && lists.indexOf(x.list) < 0) lists.push(x.list); });
  $('td-lists').innerHTML = lists.map(function(l){ return '<option value="' + esc(l) + '">'; }).join('');
  Array.prototype.forEach.call($('td-filters').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.filter === S.tdFilter)); });

  var f = S.tdFilter;
  var match = function(x){ return f === 'すべて' || x.owner === f; };
  var open = openTodos().filter(match);
  var groups = {}, order = [];
  open.forEach(function(x){ var g = x.list || 'その他'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(x); });
  $('todo-groups').innerHTML = !open.length
    ? '<div class="list"><div class="empty">' + (f === 'すべて' ? 'やることはありません。上の入力欄から追加できます。' : f + 'のやることはありません。') + '</div></div>'
    : order.map(function(g){ return '<div style="display:flex;flex-direction:column;gap:6px"><div class="group-name">' + esc(g) + '</div><div class="list">' + groups[g].map(todoRow).join('') + '</div></div>'; }).join('');

  var done = S.t.items.filter(function(x){ return x.done && match(x); }).sort(function(a, b){ return (b.doneAt || '').localeCompare(a.doneAt || ''); });
  $('toggle-done').hidden = !done.length;
  $('toggle-done').textContent = (S.showDone ? '▾ ' : '▸ ') + '完了したもの（' + done.length + '）';
  $('todo-done').hidden = !S.showDone || !done.length;
  $('todo-done').innerHTML = done.map(todoRow).join('');
}

$('todo-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var title = $('td-title').value.trim();
  if (!title) { $('td-err').textContent = 'やることを入れてください。'; return; }
  var t = {title:title, owner:S.tdOwner, due:$('td-due').value, list:$('td-list').value.trim()};
  $('td-title').value = ''; $('td-due').value = ''; $('td-err').textContent = '';
  runTodo('addTodo', [t], '「' + title + '」を追加しました');
});
$('td-title').addEventListener('input', function(){ $('td-err').textContent = ''; });
$('toggle-done').addEventListener('click', function(){ S.showDone = !S.showDone; renderTodo(); });

S.scShow = {};
/* ---------- お金：プロジェクトを追加 ---------- */
$('proj-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var name = $('pj-name').value.trim();
  if (!name) { $('pj-err').textContent = '名前を入れてください。'; return; }
  var p = {name:name, budget0:$('pj-b0').value || 0, budget1:$('pj-b1').value || 0, note:$('pj-note').value.trim()};
  $('proj-form').hidden = true;
  setBusy(true);
  api('addProject', p).then(function(d){
    S.m = d; S.project = name;
    setBusy(false); buildStatic(); go('project', name); toast('「' + name + '」を作りました');
  }).catch(function(e){ setBusy(false); $('proj-form').hidden = false; $('pj-err').textContent = errMsg(e); });
});

/* ---------- 固定費（共通口座） ---------- */
function monthLabel(ym){ var p = ym.split('-'); return p[0] + '年' + (+p[1]) + '月'; }
function shiftMonth(ym, n){ var p = ym.split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
function ratioOf(n){ return S.f.ratio[n] != null ? S.f.ratio[n] : 50; }
function fixedMonth(ym){
  var F = S.f, M = S.m.members;
  var lines = F.items.map(function(it){
    var rec = F.records.filter(function(r){ return r.month === ym && r.itemId === it.id; })[0];
    if (!it.active && !rec) return null;
    var amount = rec ? rec.amount : (it.variable ? null : it.amount);
    return {item:it, rec:rec, amount:amount, paid: rec ? rec.status === '引き落とし済み' : false};
  }).filter(Boolean).sort(function(a, b){ return (a.item.day || 99) - (b.item.day || 99); });
  var total = 0, paid = 0, unknown = 0;
  lines.forEach(function(l){ if (l.amount == null) unknown++; else { total += l.amount; if (l.paid) paid += l.amount; } });
  var deposited = {}, allowance = {}, extra = {};
  var balRow = (F.balances || []).filter(function(b){ return b.month === ym; })[0];
  var allowSrc = balRow && balRow.end != null && balRow.allowance ? balRow.allowance : (F.allowance || {});
  M.forEach(function(n){ deposited[n] = 0; allowance[n] = allowSrc[n] || 0; extra[n] = 0; });
  var deps = F.deposits.filter(function(d){ return d.month === ym; });
  deps.forEach(function(d){ if (deposited[d.who] != null) deposited[d.who] += d.amount; });
  var extras = (F.extras || []).filter(function(x){ return x.month === ym; });
  extras.forEach(function(x){ if (extra[x.who] != null) extra[x.who] += x.amount; });
  var sum = function(o){ var t = 0; for (var k in o) t += o[k]; return t; };
  var bal = (F.balances || []).filter(function(b){ return b.month === ym; })[0];
  var prev = (F.balances || []).filter(function(b){ return b.month === shiftMonth(ym, -1); })[0];
  var start = prev && prev.end != null ? prev.end : (bal && bal.start != null ? bal.start : null);
  var end = bal && bal.end != null ? bal.end : null;
  var depositTotal = sum(deposited), allowanceTotal = sum(allowance), extraTotal = sum(extra);
  var living = (start != null && end != null) ? start + depositTotal - total - allowanceTotal - extraTotal - end : null;
  return {month:ym, lines:lines, total:total, paid:paid, unknown:unknown, deposited:deposited, deps:deps, depositTotal:depositTotal,
    allowance:allowance, allowanceTotal:allowanceTotal, extra:extra, extras:extras, extraTotal:extraTotal,
    start:start, startFromPrev: !!(prev && prev.end != null), end:end, living:living, saved:(start != null && end != null) ? end - start : null};
}
function runFixed(fn, args, okMsg){
  setBusy(true);
  return api.apply(null, [fn].concat(args)).then(function(d){ S.f = d; setBusy(false); renderFixed(); if (okMsg) toast(okMsg); })
    .catch(function(e){ setBusy(false); toast(errMsg(e)); });
}
function renderFixed(){
  if (!S.f) return;
  var ym = S.fxMonth, fx = fixedMonth(ym), M = S.m.members;
  $('fx-month').textContent = monthLabel(ym);
  $('fx-hero').innerHTML = fx.living != null
    ? '<div class="label">' + monthLabel(ym) + 'の生活費（残高から計算）</div><div class="big num' + (fx.living < 0 ? ' over' : '') + '">' + sYen(fx.living) + '</div>' +
      '<div class="sub">食費・日用品など、固定費とお小遣い以外に使ったお金です' + (fx.unknown ? '（金額未入力の固定費が' + fx.unknown + '件あるので、その分も含まれています）' : '') + '</div>'
    : '<div class="label">' + monthLabel(ym) + 'の生活費</div><div class="big num" style="font-size:24px">月末の残高を入れると出ます</div>' +
      '<div class="sub">月末に通帳アプリの残高を1回入れるだけで、食費や日用品に使った額がわかります。</div>';
  var row = function(k, v, cls, act){ return '<div class="lrow' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span>' + (act ? '<button class="est-btn num" type="button" data-action="open-bal">' + v + '</button>' : '<span class="v num">' + v + '</span>') + '</div>'; };
  $('fx-ledger').innerHTML =
    row('月初の残高' + (fx.startFromPrev ? '（先月末）' : ''), fx.start != null ? yen(fx.start) : '入れる', '', !fx.startFromPrev) +
    row('＋ 給料・入金', yen(fx.depositTotal)) +
    row('− 固定費', yen(fx.total)) +
    row('− お小遣い', yen(fx.allowanceTotal)) +
    (fx.extraTotal ? row('− 臨時のお小遣い', yen(fx.extraTotal)) : '') +
    row('− 生活費（計算）', fx.living != null ? sYen(fx.living) : '—', 'calc') +
    row('＝ 月末の残高', fx.end != null ? yen(fx.end) : '入れる', 'total', true) +
    (fx.saved != null ? row('この月に増えたお金', (fx.saved >= 0 ? '＋' : '') + sYen(fx.saved)) : '');
  $('fx-people').innerHTML = M.map(function(n, i){
    return '<div class="person"><div class="who"><span class="dot" style="background:var(--m' + i + ')"></span>' + esc(n) + '</div>' +
      '<div class="paid num"><small>' + monthLabel(ym) + 'に入れた額</small>' + yen(fx.deposited[n]) + '</div></div>';
  }).join('');
  $('fx-deps').innerHTML = !fx.deps.length ? '<div class="empty">給料が入ったら記録しましょう。</div>' :
    fx.deps.slice().sort(function(a, b){ return (b.date || '').localeCompare(a.date || ''); }).map(function(d){
      var c = S.confirmDep === d.id;
      return '<div class="row"><div class="date num">' + esc(md(d.date)) + '</div><div class="main"><div class="title"><span class="chip m' + mIdx(d.who) + '">' + esc(d.who) + '</span> ' + esc(d.memo || '入金') + '</div></div>' +
        '<div class="amt num">' + yen(d.amount) + '</div>' +
        (c ? '<button class="small-btn danger" type="button" data-fx="del-dep" data-id="' + esc(d.id) + '">削除</button><button class="small-btn" type="button" data-fx="cancel">戻す</button>'
           : '<button class="icon-btn" type="button" aria-label="入金の記録を削除" data-fx="ask-del-dep" data-id="' + esc(d.id) + '">×</button>') + '</div>';
    }).join('');
  $('fx-allow').innerHTML = M.map(function(n, i){
    return '<div class="person"><div class="who"><span class="dot" style="background:var(--m' + i + ')"></span>' + esc(n) + '</div>' +
      '<div class="paid num"><small>' + monthLabel(ym) + 'のお小遣い</small>' + yen(fx.allowance[n] + fx.extra[n]) + '</div>' +
      '<div class="left num">毎月 ' + yen(fx.allowance[n]) + (fx.extra[n] ? '＋臨時 ' + yen(fx.extra[n]) : '') + '</div></div>';
  }).join('');
  $('fx-allow-edit').innerHTML = S.editAllow
    ? '毎月のお小遣い：' + M.map(function(n, i){ return esc(n) + ' <input type="number" inputmode="numeric" min="0" step="1000" id="allow-' + i + '" value="' + fx.allowance[n] + '" style="width:96px" aria-label="' + esc(n) + 'の毎月のお小遣い">'; }).join('　') +
      ' <button class="small-btn" type="button" data-fx="save-allow">保存</button><button class="small-btn" type="button" data-fx="cancel-allow">戻す</button>'
    : '<button class="link-btn" type="button" data-fx="edit-allow">毎月のお小遣いの額を変える</button>';
  $('fx-extras').innerHTML = !fx.extras.length ? '<div class="empty">旅行や結婚式などで臨時のお小遣いを出したら、ここに記録します。</div>' :
    fx.extras.map(function(x){
      var c = S.confirmExtra === x.id;
      return '<div class="row"><div class="date num">' + esc(md(x.date)) + '</div><div class="main"><div class="title"><span class="chip m' + mIdx(x.who) + '">' + esc(x.who) + '</span> ' + esc(x.reason || '臨時のお小遣い') + '</div></div>' +
        '<div class="amt num">' + yen(x.amount) + '</div>' +
        (c ? '<button class="small-btn danger" type="button" data-fx="del-extra" data-id="' + esc(x.id) + '">削除</button><button class="small-btn" type="button" data-fx="cancel-extra">戻す</button>'
           : '<button class="icon-btn" type="button" aria-label="臨時のお小遣いを削除" data-fx="ask-del-extra" data-id="' + esc(x.id) + '">×</button>') + '</div>';
    }).join('');
  if (!fx.lines.length) {
    var quick = [['家賃','住居',false],['電気','光熱費',true],['ガス','光熱費',true],['水道','光熱費',true],['インターネット','通信',false],['スマホ','通信',false]];
    $('fx-items').innerHTML = '<div class="empty">まだ項目がありません。よく使うものから追加できます。<div class="row-actions" style="justify-content:center;margin-top:10px">' +
      quick.map(function(q){ return '<button class="small-btn" type="button" data-fx="quick" data-name="' + q[0] + '" data-cat="' + q[1] + '" data-var="' + q[2] + '">＋ ' + q[0] + '</button>'; }).join('') + '</div></div>';
  } else {
    $('fx-items').innerHTML = fx.lines.map(function(l){
      var it = l.item, amtHtml;
      if (S.editRec === it.id) amtHtml = '<form class="inline-est" data-fxform="amount" data-id="' + esc(it.id) + '"><input id="rec-input" type="number" inputmode="numeric" min="0" step="1" value="' + (l.amount != null ? l.amount : '') + '" aria-label="今月の金額（円）"><button class="small-btn" type="submit">保存</button></form>';
      else if (l.amount == null) amtHtml = '<button class="need" type="button" data-fx="edit-rec" data-id="' + esc(it.id) + '">金額を入れる</button>';
      else amtHtml = '<button class="est-btn num" type="button" data-fx="edit-rec" data-id="' + esc(it.id) + '">' + yen(l.amount) + '</button>';
      return '<div class="row"><div class="date num">' + (it.day ? it.day + '日' : '') + '</div>' +
        '<div class="main"><div class="title">' + esc(it.name) + (it.active ? '' : '（やめた）') + '</div><div class="sub"><span>' + esc(it.category) + '</span>' + (it.variable ? '<span>毎月変わる</span>' : '') + (it.memo ? '<span>' + esc(it.memo) + '</span>' : '') +
        '<button class="link-btn" type="button" data-fx="edit-item" data-id="' + esc(it.id) + '">編集</button></div></div>' +
        amtHtml + '<button class="paid-btn' + (l.paid ? ' on' : '') + '" type="button" data-fx="toggle-paid" data-id="' + esc(it.id) + '">' + (l.paid ? '済み' : '予定') + '</button></div>';
    }).join('');
  }
  if (S.editRec) { var ri = $('rec-input'); if (ri) ri.focus(); }
}
function openBalForm(){
  var fx = fixedMonth(S.fxMonth);
  $('bal-form').hidden = false; $('bal-err').textContent = '';
  $('bal-title').textContent = monthLabel(S.fxMonth) + 'の残高';
  $('bal-start-field').hidden = fx.startFromPrev;
  $('bal-start').value = fx.startFromPrev ? '' : (fx.start != null ? fx.start : '');
  $('bal-end').value = fx.end != null ? fx.end : '';
  $('bal-form').scrollIntoView({behavior:'smooth', block:'center'});
}
$('bal-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var fx = fixedMonth(S.fxMonth), end = $('bal-end').value.trim(), start = fx.startFromPrev ? '' : $('bal-start').value.trim();
  if (end !== '' && isNaN(Number(end))) { $('bal-err').textContent = '残高は数字で入れてください。'; return; }
  if (start !== '' && isNaN(Number(start))) { $('bal-err').textContent = '残高は数字で入れてください。'; return; }
  $('bal-form').hidden = true;
  var bal = (S.f.balances || []).filter(function(b){ return b.month === S.fxMonth; })[0];
  if (fx.startFromPrev && bal && bal.start != null) start = bal.start;
  runFixed('setBalance', [S.fxMonth, end, start], '残高を保存しました');
});
$('extra-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var amount = Math.round(Number($('ex2-amount').value));
  if (!(amount > 0)) { $('ex2-err').textContent = '金額を1円以上で入れてください。'; return; }
  $('extra-form').hidden = true;
  runFixed('addExtra', [{who:S.exWho, amount:amount, date:$('ex2-date').value || S.f.today, month:S.fxMonth, reason:$('ex2-reason').value.trim()}], S.exWho + 'の臨時のお小遣い ' + yen(amount) + ' を記録しました');
});
function openItemForm(it, preset){
  S.editItem = it ? it.id : null;
  $('item-form').hidden = false; $('it-err').textContent = '';
  $('item-form-title').textContent = it ? '「' + it.name + '」を編集' : '固定費の項目を追加';
  $('it-submit').textContent = it ? '保存する' : '追加する';
  $('it-stop').hidden = !it || !it.active;
  $('it-name').value = it ? it.name : ((preset && preset.name) || '');
  $('it-amount').value = it ? (it.amount || '') : '';
  $('it-day').value = it ? it.day : '';
  $('it-cat').value = it ? it.category : ((preset && preset.cat) || S.f.categories[0] || '');
  $('it-var').checked = it ? it.variable : !!(preset && preset.variable);
  $('it-memo').value = it ? it.memo : '';
  $('item-form').scrollIntoView({behavior:'smooth', block:'center'});
}
function openDepForm(){
  $('dep-form').hidden = false; $('dep-err').textContent = ''; $('dep-memo').value = ''; $('dep-amount').value = '';
  $('dep-date').value = S.f.today;
  $('dep-form').scrollIntoView({behavior:'smooth', block:'center'});
  setTimeout(function(){ $('dep-amount').focus(); }, 250);
}
$('item-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var f = {name:$('it-name').value.trim(), amount:$('it-amount').value || 0, day:$('it-day').value, category:$('it-cat').value, variable:$('it-var').checked, memo:$('it-memo').value.trim()};
  if (!f.name) { $('it-err').textContent = '項目名を入れてください。'; return; }
  if (!(Number(f.amount) >= 0)) { $('it-err').textContent = '金額は0以上で入れてください。'; return; }
  if (f.day !== '' && !(Number(f.day) >= 1 && Number(f.day) <= 31)) { $('it-err').textContent = '引き落とし日は1〜31で入れてください。'; return; }
  $('item-form').hidden = true;
  if (S.editItem) runFixed('updateFixedItem', [S.editItem, f], '保存しました');
  else runFixed('addFixedItem', [f], '「' + f.name + '」を追加しました');
});
$('dep-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var amount = Math.round(Number($('dep-amount').value));
  if (!(amount > 0)) { $('dep-err').textContent = '金額を1円以上で入れてください。'; return; }
  $('dep-form').hidden = true;
  runFixed('addDeposit', [{who:S.depWho, amount:amount, date:$('dep-date').value || S.f.today, month:S.fxMonth, memo:$('dep-memo').value.trim()}], S.depWho + 'の入金 ' + yen(amount) + ' を記録しました');
});
document.addEventListener('submit', function(ev){
  var f = ev.target.closest('[data-fxform="amount"]'); if (!f) return;
  ev.preventDefault();
  var id = f.dataset.id, raw = $('rec-input').value.trim();
  if (raw === '' || !(Number(raw) >= 0)) { toast('金額を0以上の数字で入れてください'); return; }
  var l = fixedMonth(S.fxMonth).lines.filter(function(x){ return x.item.id === id; })[0];
  S.editRec = null;
  runFixed('setFixedRecord', [S.fxMonth, id, Number(raw), l && l.paid ? '引き落とし済み' : '予定'], '金額を保存しました');
});

/* ---------- 書類 ---------- */
var DOC_MAX = 15 * 1024 * 1024;
function fmtSize(n){ return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
function openDocs(){
  renderWarranties();
  if (S.docs) { renderDocs(); return; }
  $('docs-list').innerHTML = '<div class="list"><div class="empty">読み込み中…</div></div>';
  api('getDocs').then(function(d){ S.docs = d; if (S.view === 'docs') renderDocs(); })
    .catch(function(e){ $('docs-list').innerHTML = '<div class="list"><div class="empty">' + esc(errMsg(e)) + '</div></div>'; });
}
function renderDocs(){
  var d = S.docs;
  $('doc-cat').innerHTML = d.categories.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
  $('docs-list').innerHTML = d.categories.map(function(c){
    return '<div style="display:flex;flex-direction:column;gap:6px"><div class="group-name">' + esc(c.name) + '（' + c.files.length + '）</div><div class="list">' +
      (c.files.length ? c.files.map(function(f){
        var conf = S.confirmFile === f.id;
        return '<div class="row clickable" data-open-file="' + esc(f.id) + '" data-name="' + esc(f.name) + '"><span class="badge ' + f.kind + '">' + (f.kind === 'pdf' ? 'PDF' : f.kind === 'image' ? '画像' : 'ファイル') + '</span>' +
          '<div class="main"><div class="title">' + esc(f.name) + '</div><div class="sub"><span>' + esc(f.updated) + '</span><span>' + fmtSize(f.size) + '</span>' +
          (function(){ var w = warrantyFor(f.id); return w ? '<span>保証 ' + esc(w.date.replace(/-/g, '/')) + 'まで</span>' : ''; })() +
          '<button class="link-btn" type="button" data-war-file="' + esc(f.id) + '" data-name="' + esc(f.name) + '">' + (warrantyFor(f.id) ? '保証期限を変える' : '保証期限を登録') + '</button></div></div>' +
          (conf ? '<button class="small-btn danger" type="button" data-doc="trash" data-id="' + esc(f.id) + '">削除</button><button class="small-btn" type="button" data-doc="cancel">戻す</button>'
                : '<button class="icon-btn" type="button" aria-label="' + esc(f.name) + 'を削除" data-doc="ask-trash" data-id="' + esc(f.id) + '">×</button>') + '</div>';
      }).join('') : '<div class="empty">まだありません</div>') + '</div></div>';
  }).join('') || '<div class="list"><div class="empty">分類がありません。「＋ 分類を作る」から作れます。</div></div>';
  renderWarranties();
}
function readDataUrl(file){
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = function(){ res(r.result); };
    r.onerror = function(){ rej(new Error('ファイルを読み込めませんでした。')); };
    r.readAsDataURL(file);
  });
}
function isPdf(f){ return f.type === 'application/pdf' || /\.pdf$/i.test(f.name); }
$('doc-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var files = Array.prototype.slice.call($('doc-file').files || []);
  if (!files.length) { $('doc-err').textContent = 'ファイルを選んでください。'; return; }
  var bad = files.filter(function(f){ return !(isPdf(f) || /^image\//.test(f.type)); })[0];
  if (bad) { $('doc-err').textContent = '「' + bad.name + '」は保存できません。写真かPDFを選んでください。'; return; }
  var big = files.filter(function(f){ return isPdf(f) && f.size > DOC_MAX; })[0];
  if (big) { $('doc-err').textContent = '「' + big.name + '」が大きすぎます（15MBまで）。'; return; }
  var folder = $('doc-cat').value, custom = $('doc-name').value.trim(), i = 0;
  $('doc-form').hidden = true; setBusy(true);
  (function next(){
    if (i >= files.length) { setBusy(false); $('doc-file').value = ''; $('doc-name').value = ''; renderDocs(); toast(files.length + '件 保存しました'); return; }
    var f = files[i], pdf = isPdf(f);
    toast((i + 1) + ' / ' + files.length + ' 件目を保存しています…');
    var base = (files.length === 1 && custom) ? custom : f.name.replace(/\.[^.]+$/, '');
    (pdf ? readDataUrl(f) : shrinkImage(f, 2400, 0.85))
      .then(function(du){ return api('uploadDoc', folder, base + (pdf ? '.pdf' : '.jpg'), du); })
      .then(function(d){ S.docs = d; i++; next(); })
      .catch(function(e){ setBusy(false); renderDocs(); toast(errMsg(e)); });
  })();
});
$('docfolder-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var n = $('docfolder-name').value.trim();
  if (!n) { $('docfolder-err').textContent = '名前を入れてください。'; return; }
  setBusy(true);
  api('addDocFolder', n).then(function(d){ S.docs = d; setBusy(false); $('docfolder-form').hidden = true; $('docfolder-name').value = ''; renderDocs(); toast('「' + n + '」を作りました'); })
    .catch(function(e){ setBusy(false); $('docfolder-err').textContent = errMsg(e); });
});

/* ---------- ファイルを見る画面 ---------- */
function openViewer(name){
  $('viewer').hidden = false; $('viewer-name').textContent = name || '';
  $('viewer-body').innerHTML = '<div class="msg">読み込み中…</div>'; $('viewer-actions').innerHTML = '';
  document.body.style.overflow = 'hidden';
}
function closeViewer(){
  if ($('viewer').hidden) return;
  $('viewer').hidden = true; document.body.style.overflow = '';
  S.confirmPhoto = null;
  if (S.blobUrl) { URL.revokeObjectURL(S.blobUrl); S.blobUrl = null; }
}
function dataUrlToBlobUrl(du){
  var m = du.match(/^data:([^;]+);base64,(.*)$/), bin = atob(m[2]), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], {type:m[1]}));
}
function showFile(id, name, extraHtml){
  openViewer(name);
  S.viewerId = id;
  api('getFileData', id).then(function(d){
    if ($('viewer').hidden || S.viewerId !== id) return;
    if (S.blobUrl) URL.revokeObjectURL(S.blobUrl);
    S.blobUrl = dataUrlToBlobUrl(d.dataUrl);
    var isImg = /^image\//.test(d.mime);
    $('viewer-body').innerHTML = isImg ? '<img src="' + S.blobUrl + '" alt="' + esc(d.name) + '">'
      : (d.mime === 'application/pdf' ? '<iframe src="' + S.blobUrl + '" title="' + esc(d.name) + '"></iframe>' : '<div class="msg">このファイルはここでは表示できません。</div>');
    $('viewer-actions').innerHTML = '<a href="' + S.blobUrl + '" target="_blank" rel="noopener">別の画面で開く</a>' + (extraHtml || '');
  }).catch(function(e){
    if (S.viewerId !== id) return;
    $('viewer-body').innerHTML = '<div class="msg">' + esc(errMsg(e)) + '</div>';
  });
}

/* ---------- 写真 ---------- */
function openPhotos(){
  if (S.albums) { renderAlbums(); return; }
  $('albums').innerHTML = '<div class="empty" style="grid-column:1/-1">読み込み中…</div>';
  api('getAlbums').then(function(d){ S.albums = d; if (S.view === 'photos') renderAlbums(); })
    .catch(function(e){ $('albums').innerHTML = '<div class="empty" style="grid-column:1/-1">' + esc(errMsg(e)) + '</div>'; });
}
function renderAlbums(){
  var a = S.albums.albums;
  $('albums').innerHTML = !a.length ? '<div class="list" style="grid-column:1/-1"><div class="empty">まだアルバムがありません。「＋ アルバムを作る」から始めましょう。</div></div>' :
    a.map(function(x){
      return '<button class="album" type="button" data-album="' + esc(x.id) + '"><div class="cover">' + (x.cover ? '<img src="' + x.cover + '" alt="">' : '写真なし') + '</div>' +
        '<div class="a-name">' + esc(x.name) + '</div><div class="a-count">' + x.count + '枚</div></button>';
    }).join('');
}
$('album-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var n = $('album-name').value.trim();
  if (!n) { $('album-err').textContent = '名前を入れてください。'; return; }
  setBusy(true);
  api('addAlbum', n).then(function(d){ S.albums = d; setBusy(false); $('album-form').hidden = true; renderAlbums(); toast('「' + n + '」を作りました'); })
    .catch(function(e){ setBusy(false); $('album-err').textContent = errMsg(e); });
});
function openAlbum(id){
  if (!id) { go('photos'); return; }
  if (S.album && S.album.id === id) { renderAlbum(); return; }
  S.album = null;
  $('album-title').textContent = 'アルバム'; $('album-count').textContent = '';
  $('photo-grid').innerHTML = '<div class="empty" style="grid-column:1/-1">読み込み中…</div>';
  api('getAlbum', id).then(function(d){ S.album = d; if (S.view === 'album') renderAlbum(); })
    .catch(function(e){ $('photo-grid').innerHTML = '<div class="empty" style="grid-column:1/-1">' + esc(errMsg(e)) + '</div>'; });
}
function renderAlbum(){
  var a = S.album;
  $('album-title').textContent = a.name; $('album-count').textContent = a.photos.length + '枚';
  $('photo-grid').innerHTML = !a.photos.length ? '<div class="empty" style="grid-column:1/-1">右上の「＋ 写真」から追加できます。</div>' :
    a.photos.map(function(p){ return '<button type="button" data-photo="' + esc(p.id) + '" data-name="' + esc(p.name) + '" aria-label="' + esc(p.name) + '">' + (p.thumb ? '<img src="' + p.thumb + '" alt="" loading="lazy">' : '') + '</button>'; }).join('');
}
$('album-input').addEventListener('change', function(){
  var files = Array.prototype.slice.call(this.files || []).filter(function(f){ return /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name); });
  this.value = '';
  if (!files.length || !S.album) return;
  var albumId = S.album.id, i = 0, ok = 0;
  setBusy(true);
  (function next(){
    if (i >= files.length) { setBusy(false); S.albums = null; if (S.album && S.album.id === albumId) renderAlbum(); toast(ok + '枚 追加しました'); return; }
    var f = files[i];
    toast((i + 1) + ' / ' + files.length + ' 枚目を保存しています…');
    shrinkImage(f, 1600, 0.82).then(function(du){ return api('uploadPhoto', albumId, du, f.name.replace(/\.[^.]+$/, '') + '.jpg'); })
      .then(function(p){ ok++; if (S.album && S.album.id === albumId) { S.album.photos.unshift(p); renderAlbum(); } i++; next(); })
      .catch(function(e){ toast(errMsg(e)); i++; next(); });
  })();
});

/* ---------- 機密（ブラウザの中で暗号化） ---------- */
var VAULT_ITER = 600000, LOCK_MS = 5 * 60 * 1000;
var SC_CATS = ['Wi-Fi・家', '銀行・カード', '契約・会員番号', 'ネット・サブスク', 'その他'];
var TE = window.TextEncoder ? new TextEncoder() : null, TD = window.TextDecoder ? new TextDecoder() : null;
function b64(buf){ var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
function unb64(s){ var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function deriveKey(pw, salt, iter){
  return crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function(base){
    return crypto.subtle.deriveKey({name:'PBKDF2', salt:salt, iterations:iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  });
}
function sealVault(v){
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, v.key, TE.encode(JSON.stringify(v.data))).then(function(ct){
    return JSON.stringify({v:1, kdf:'PBKDF2-SHA256', iter:v.iter, salt:b64(v.salt), iv:b64(iv), ct:b64(ct)});
  });
}
function unsealVault(text, pw){
  var o = JSON.parse(text), salt = unb64(o.salt);
  return deriveKey(pw, salt, o.iter).then(function(key){
    return crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(o.iv)}, key, unb64(o.ct)).then(function(pt){
      return {key:key, salt:salt, iter:o.iter, data:JSON.parse(TD.decode(pt))};
    }, function(){ throw new Error('パスワードが違います。'); });
  });
}
function lockVault(){
  var was = !!S.vault;
  S.vault = null; S.scShow = {}; S.scEdit = undefined; S.scConfirm = null; S.scPwForm = false;
  clearTimeout(S.lockTimer);
  if (was && S.view === 'secret') renderSecret();
}
function touchVault(){ clearTimeout(S.lockTimer); if (S.vault) S.lockTimer = setTimeout(function(){ lockVault(); toast('しばらく操作がなかったのでロックしました'); }, LOCK_MS); }
function openSecret(){
  if (!window.crypto || !crypto.subtle || !TE) { $('sc-body').innerHTML = '<div class="sc-card"><p class="warn">このブラウザでは機密を開けません。SafariかChromeで開いてください。</p></div>'; return; }
  if (S.vault) { renderSecret(); return; }
  $('sc-body').innerHTML = '<div class="sc-card"><p>読み込み中…</p></div>';
  api('getVault').then(function(d){ S.vaultMeta = d; if (S.view === 'secret') renderSecret(); })
    .catch(function(e){ $('sc-body').innerHTML = '<div class="sc-card"><p class="warn">' + esc(errMsg(e)) + '</p></div>'; });
}
function genPassword(){
  var cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%+-=?@', out = '', r = crypto.getRandomValues(new Uint32Array(16));
  for (var i = 0; i < 16; i++) out += cs.charAt(r[i] % cs.length);
  return out;
}
function renderSecret(){
  $('sc-lock').hidden = !S.vault;
  var meta = S.vaultMeta;
  if (!S.vault) {
    if (!meta) return;
    if (!meta.exists) {
      $('sc-body').innerHTML = '<form class="sc-card" id="sc-setup" novalidate><h2>ふたりのパスワードを決める</h2>' +
        '<p>機密に入れたものは、このパスワードでスマホの中で暗号化してから保存します。ドライブには暗号化された文字しか残らないので、Googleアカウントが見られても中身はわかりません。</p>' +
        '<p class="warn">このパスワードを忘れると、誰にも（私にも）中身を戻せません。紙に書いて家にしまっておくなど、ふたりで必ず控えておいてください。</p>' +
        '<div class="field"><label for="sc-pw1">パスワード（12文字以上がおすすめ）</label><input id="sc-pw1" type="password" autocomplete="new-password"></div>' +
        '<div class="field"><label for="sc-pw2">もう一度</label><input id="sc-pw2" type="password" autocomplete="new-password"></div>' +
        '<div class="err" id="sc-err"></div><div class="actions"><button class="btn" type="submit">作る</button></div></form>';
    } else {
      $('sc-body').innerHTML = '<form class="sc-card" id="sc-unlock" novalidate><h2>🔒 ロックされています</h2><p>ふたりで決めたパスワードを入れてください。5分操作しないと自動でロックします。</p>' +
        '<div class="field"><label for="sc-pw">パスワード</label><input id="sc-pw" type="password" autocomplete="current-password"></div>' +
        '<div class="err" id="sc-err"></div><div class="actions"><button class="btn" type="submit">開く</button></div></form>';
      setTimeout(function(){ var p = $('sc-pw'); if (p) p.focus(); }, 50);
    }
    return;
  }
  var q = (S.scQuery || '').toLowerCase();
  var list = S.vault.data.entries.filter(function(e){ return !q || (e.title + ' ' + e.user + ' ' + e.memo + ' ' + e.category).toLowerCase().indexOf(q) >= 0; });
  var html = '<div class="row-actions"><input class="sc-search" id="sc-q" placeholder="さがす" value="' + esc(S.scQuery || '') + '" aria-label="さがす"></div>' +
    '<div class="row-actions"><button class="btn" type="button" data-sc="new">＋ 追加</button></div>';
  if (S.scEdit !== undefined) {
    var e = S.scEdit ? S.vault.data.entries.filter(function(x){ return x.id === S.scEdit; })[0] || {} : {};
    html += '<form class="form" id="sc-form" novalidate><div class="ftitle">' + (S.scEdit ? '「' + esc(e.title) + '」を編集' : '機密を追加') + '</div>' +
      '<div class="field"><label for="se-title">名前</label><input id="se-title" maxlength="60" value="' + esc(e.title || '') + '" placeholder="例：家のWi-Fi、〇〇銀行"></div>' +
      '<div class="field"><label for="se-cat">分類</label><select class="in" id="se-cat">' + SC_CATS.map(function(c){ return '<option' + (c === e.category ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="se-user">ID・ユーザー名・番号</label><input id="se-user" autocomplete="off" value="' + esc(e.user || '') + '"></div>' +
      '<div class="field"><label for="se-pass">パスワード</label><div class="pw-row"><input id="se-pass" autocomplete="off" value="' + esc(e.password || '') + '"><button class="small-btn" type="button" data-sc="gen">自動で作る</button></div></div>' +
      '<div class="field"><label for="se-url">URL（任意）</label><input id="se-url" inputmode="url" value="' + esc(e.url || '') + '"></div>' +
      '<div class="field"><label for="se-memo">メモ（任意）</label><input id="se-memo" maxlength="300" value="' + esc(e.memo || '') + '"></div>' +
      '<div class="err" id="se-err"></div><div class="actions"><button class="btn ghost" type="button" data-sc="cancel-edit">やめる</button><button class="btn" type="submit">保存する</button></div></form>';
  }
  var groups = {}; SC_CATS.forEach(function(c){ groups[c] = []; });
  list.forEach(function(x){ (groups[x.category] || (groups[x.category] = [])).push(x); });
  var body = Object.keys(groups).filter(function(k){ return groups[k].length; }).map(function(k){
    return '<div style="display:flex;flex-direction:column;gap:6px"><div class="group-name">' + esc(k) + '</div><div class="list">' + groups[k].sort(function(a, b){ return a.title.localeCompare(b.title, 'ja'); }).map(function(x){
      var shown = S.scShow[x.id], c = S.scConfirm === x.id;
      return '<div class="row sc-entry"><div class="main"><div class="title">' + esc(x.title) + '</div>' +
        (x.user ? '<div class="sc-line"><span class="lab">ID</span><span class="secret-val">' + esc(x.user) + '</span><button class="mini-btn" type="button" data-sc="copy-user" data-id="' + esc(x.id) + '">コピー</button></div>' : '') +
        (x.password ? '<div class="sc-line"><span class="lab">パスワード</span><span class="secret-val">' + (shown ? esc(x.password) : '••••••••') + '</span><button class="mini-btn" type="button" data-sc="toggle" data-id="' + esc(x.id) + '">' + (shown ? '隠す' : '表示') + '</button><button class="mini-btn" type="button" data-sc="copy-pass" data-id="' + esc(x.id) + '">コピー</button></div>' : '') +
        (x.url ? '<div class="sc-line"><span class="lab">URL</span><a class="secret-val" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.url) + '</a></div>' : '') +
        (x.memo ? '<div class="sub" style="margin-top:4px">' + esc(x.memo) + '</div>' : '') +
        '<div class="sub" style="margin-top:4px"><span>' + esc(x.updatedBy || '') + ' ' + esc((x.updatedAt || '').slice(0, 10)) + '</span><button class="link-btn" type="button" data-sc="edit" data-id="' + esc(x.id) + '">編集</button>' +
        (c ? '<button class="small-btn danger" type="button" data-sc="delete" data-id="' + esc(x.id) + '">削除</button><button class="small-btn" type="button" data-sc="cancel-del">戻す</button>' : '<button class="link-btn" type="button" data-sc="ask-del" data-id="' + esc(x.id) + '">削除</button>') +
        '</div></div></div>';
    }).join('') + '</div></div>';
  }).join('');
  html += body || '<div class="list"><div class="empty">' + (q ? '見つかりませんでした。' : 'まだ何も入っていません。Wi-Fiのパスワードや契約番号など、ふたりで共有したいものを入れておきましょう。') + '</div></div>';
  html += S.scPwForm
    ? '<form class="form" id="sc-pwform" novalidate><div class="ftitle">機密のパスワードを変える</div>' +
      '<div class="field"><label for="sc-np1">新しいパスワード</label><input id="sc-np1" type="password" autocomplete="new-password"></div>' +
      '<div class="field"><label for="sc-np2">もう一度</label><input id="sc-np2" type="password" autocomplete="new-password"></div>' +
      '<div class="err" id="sc-np-err"></div><div class="actions"><button class="btn ghost" type="button" data-sc="cancel-pw">やめる</button><button class="btn" type="submit">変える</button></div></form>'
    : '<div class="home-foot"><button type="button" data-sc="open-pw">機密のパスワードを変える</button></div>';
  $('sc-body').innerHTML = html;
}
function saveVault(newData, okMsg){
  var v = S.vault, next = {key:v.key, salt:v.salt, iter:v.iter, data:newData};
  setBusy(true);
  return sealVault(next).then(function(text){ return api('saveVault', text, v.version).then(function(r){ return {text:text, r:r}; }); })
    .then(function(x){
      next.version = x.r.version; S.vault = next; S.vaultMeta = {exists:true, text:x.text, version:x.r.version};
      setBusy(false); S.scEdit = undefined; renderSecret(); if (okMsg) toast(okMsg);
    })
    .catch(function(e){
      setBusy(false); toast(errMsg(e));
      if (e.code === 'conflict') { lockVault(); S.vaultMeta = null; openSecret(); }
    });
}
function copyText(t){
  var fallback = function(){ toast('コピーできませんでした。長押しでコピーしてください'); };
  try { navigator.clipboard.writeText(t).then(function(){ toast('コピーしました'); }, fallback); } catch(e) { fallback(); }
}
document.addEventListener('submit', function(ev){
  var f = ev.target;
  if (f.id === 'sc-setup') {
    ev.preventDefault();
    var p1 = $('sc-pw1').value, p2 = $('sc-pw2').value;
    if (p1.length < 8) { $('sc-err').textContent = '8文字以上にしてください（12文字以上がおすすめです）。'; return; }
    if (p1 !== p2) { $('sc-err').textContent = '2つのパスワードが違います。'; return; }
    setBusy(true);
    var salt = crypto.getRandomValues(new Uint8Array(16));
    deriveKey(p1, salt, VAULT_ITER).then(function(key){
      S.vault = {key:key, salt:salt, iter:VAULT_ITER, data:{entries:[]}, version:0};
      setBusy(false); touchVault(); saveVault({entries:[]}, '機密を作りました');
    }).catch(function(e){ setBusy(false); $('sc-err').textContent = errMsg(e); });
  } else if (f.id === 'sc-unlock') {
    ev.preventDefault();
    var pw = $('sc-pw').value;
    if (!pw) { $('sc-err').textContent = 'パスワードを入れてください。'; return; }
    setBusy(true);
    unsealVault(S.vaultMeta.text, pw).then(function(v){
      v.version = S.vaultMeta.version; S.vault = v; S.scShow = {};
      setBusy(false); touchVault(); renderSecret(); renderHomeSecretState();
    }).catch(function(e){ setBusy(false); $('sc-err').textContent = errMsg(e); $('sc-pw').value = ''; });
  } else if (f.id === 'sc-form') {
    ev.preventDefault();
    var title = $('se-title').value.trim();
    if (!title) { $('se-err').textContent = '名前を入れてください。'; return; }
    var now = new Date().toISOString(), entries = S.vault.data.entries.slice();
    var item = {title:title, category:$('se-cat').value, user:$('se-user').value.trim(), password:$('se-pass').value, url:$('se-url').value.trim(), memo:$('se-memo').value.trim(), updatedAt:now, updatedBy:S.me.member || ''};
    if (S.scEdit) entries = entries.map(function(x){ return x.id === S.scEdit ? Object.assign({id:x.id}, item) : x; });
    else entries.push(Object.assign({id:b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+\/=]/g, '')}, item));
    saveVault({entries:entries}, '保存しました');
  } else if (f.id === 'sc-pwform') {
    ev.preventDefault();
    var n1 = $('sc-np1').value, n2 = $('sc-np2').value;
    if (n1.length < 8) { $('sc-np-err').textContent = '8文字以上にしてください。'; return; }
    if (n1 !== n2) { $('sc-np-err').textContent = '2つのパスワードが違います。'; return; }
    setBusy(true);
    var ns = crypto.getRandomValues(new Uint8Array(16));
    deriveKey(n1, ns, VAULT_ITER).then(function(key){
      S.vault = {key:key, salt:ns, iter:VAULT_ITER, data:S.vault.data, version:S.vault.version};
      setBusy(false); S.scPwForm = false; saveVault(S.vault.data, 'パスワードを変えました。ふたりで新しいパスワードを控えてください');
    }).catch(function(e){ setBusy(false); $('sc-np-err').textContent = errMsg(e); });
  }
});
document.addEventListener('input', function(ev){
  if (ev.target.id === 'sc-q') {
    S.scQuery = ev.target.value; var pos = ev.target.selectionStart;
    renderSecret(); var q = $('sc-q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch(e) {}
  }
  if (S.view === 'secret') touchVault();
});
function renderHomeSecretState(){ $('tile-secret-state').textContent = S.vault ? '🔓 開いています' : '🔒 ロック中'; }
$('sc-lock').addEventListener('click', function(){ lockVault(); renderHomeSecretState(); toast('ロックしました'); });
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden' && S.vault) { lockVault(); renderHomeSecretState(); } });

/* ---------- 新しい画面のボタン ---------- */
$('mh-toggle-done').addEventListener('click', function(){ S.showDoneProj = !S.showDoneProj; renderMoneyHub(); });
document.addEventListener('click', function(ev){
  var pc = ev.target.closest('[data-proj]'); if (pc) { go('project', pc.dataset.proj); return; }
  var ps = ev.target.closest('[data-pstatus]');
  if (ps && !S.busy) {
    var st = ps.dataset.pstatus, nm = S.project;
    setBusy(true);
    api('setProjectStatus', nm, st).then(function(d){ S.m = d; setBusy(false); toast(st === '完了' ? '「' + nm + '」を完了にしました' : '進行中に戻しました'); if (st === '完了') go('money'); else renderMoney(); })
      .catch(function(e){ setBusy(false); toast(errMsg(e)); });
    return;
  }

  if (S.view === 'secret') touchVault();
  var xw = ev.target.closest('[data-exwho]');
  if (xw) { S.exWho = xw.dataset.exwho; Array.prototype.forEach.call($('ex2-who').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.exwho === S.exWho)); }); return; }
  var dw = ev.target.closest('[data-depwho]');
  if (dw) {
    S.depWho = dw.dataset.depwho;
    Array.prototype.forEach.call($('dep-who').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.depwho === S.depWho)); });
    return;
  }
  var mb = ev.target.closest('[data-month]');
  if (mb) { S.fxMonth = shiftMonth(S.fxMonth, Number(mb.dataset.month)); S.editRec = null; renderFixed(); return; }
  if (S.busy) return;

  var al = ev.target.closest('[data-album]'); if (al) { go('album', al.dataset.album); return; }
  var ph = ev.target.closest('[data-photo]');
  if (ph) {
    var pid = ph.dataset.photo;
    showFile(pid, ph.dataset.name, '<button type="button" data-ph="home" data-id="' + esc(pid) + '">ホームに使う</button><button type="button" class="danger" data-ph="trash" data-id="' + esc(pid) + '">削除</button>');
    return;
  }
  var pa = ev.target.closest('[data-ph]');
  if (pa) {
    var id0 = pa.dataset.id;
    if (pa.dataset.ph === 'home') {
      setBusy(true);
      api('setHomeFromPhoto', id0).then(function(){ setBusy(false); toast('ホームの写真に追加しました'); }).catch(function(e){ setBusy(false); toast(errMsg(e)); });
    } else if (pa.dataset.ph === 'trash') {
      if (S.confirmPhoto !== id0) { S.confirmPhoto = id0; pa.textContent = 'もう一度押すと削除'; return; }
      setBusy(true);
      api('trashFile', id0).then(function(){
        setBusy(false); closeViewer(); S.albums = null;
        if (S.album) { S.album.photos = S.album.photos.filter(function(p){ return p.id !== id0; }); renderAlbum(); }
        toast('削除しました（ドライブのゴミ箱から30日以内なら戻せます）');
      }).catch(function(e){ setBusy(false); toast(errMsg(e)); });
    }
    return;
  }

  var dc = ev.target.closest('[data-doc]');
  if (dc) {
    var did = dc.dataset.id;
    if (dc.dataset.doc === 'ask-trash') { S.confirmFile = did; renderDocs(); }
    else if (dc.dataset.doc === 'cancel') { S.confirmFile = null; renderDocs(); }
    else if (dc.dataset.doc === 'trash') {
      S.confirmFile = null; setBusy(true);
      api('trashFile', did).then(function(){ setBusy(false); S.docs.categories.forEach(function(c){ c.files = c.files.filter(function(f){ return f.id !== did; }); }); renderDocs(); toast('削除しました（ドライブのゴミ箱から30日以内なら戻せます）'); })
        .catch(function(e){ setBusy(false); toast(errMsg(e)); });
    }
    return;
  }
  var of = ev.target.closest('[data-open-file]'); if (of) { showFile(of.dataset.openFile, of.dataset.name); return; }

  var fb = ev.target.closest('[data-fx]');
  if (fb) {
    var a = fb.dataset.fx, id = fb.dataset.id;
    if (a === 'quick') openItemForm(null, {name:fb.dataset.name, cat:fb.dataset.cat, variable:fb.dataset['var'] === 'true'});
    else if (a === 'edit-item') openItemForm(S.f.items.filter(function(x){ return x.id === id; })[0]);
    else if (a === 'edit-rec') { S.editRec = id; renderFixed(); }
    else if (a === 'toggle-paid') {
      var l = fixedMonth(S.fxMonth).lines.filter(function(x){ return x.item.id === id; })[0];
      if (!l) return;
      if (l.amount == null) { S.editRec = id; renderFixed(); toast('先に今月の金額を入れてください'); return; }
      runFixed('setFixedRecord', [S.fxMonth, id, l.amount, l.paid ? '予定' : '引き落とし済み'], l.paid ? '予定に戻しました' : '「' + l.item.name + '」引き落とし済み');
    }
    else if (a === 'ask-del-dep') { S.confirmDep = id; renderFixed(); }
    else if (a === 'cancel') { S.confirmDep = null; renderFixed(); }
    else if (a === 'del-dep') { S.confirmDep = null; runFixed('deleteDeposit', [id], '削除しました'); }
    else if (a === 'edit-allow') { S.editAllow = true; renderFixed(); }
    else if (a === 'cancel-allow') { S.editAllow = false; renderFixed(); }
    else if (a === 'save-allow') {
      var al = {}; S.m.members.forEach(function(n, i){ al[n] = Number($('allow-' + i).value) || 0; });
      S.editAllow = false; runFixed('setAllowance', [al], 'お小遣いの額を保存しました');
    }
    else if (a === 'ask-del-extra') { S.confirmExtra = id; renderFixed(); }
    else if (a === 'cancel-extra') { S.confirmExtra = null; renderFixed(); }
    else if (a === 'del-extra') { S.confirmExtra = null; runFixed('deleteExtra', [id], '削除しました'); }
    else if (a === 'save-ratio') {
      var ratio = {}; S.m.members.forEach(function(n, i){ ratio[n] = Number($('ratio-' + i).value) || 0; });
      S.editRatio = false; runFixed('setRatio', [ratio], '割合を保存しました');
    }
    return;
  }

  var sc = ev.target.closest('[data-sc]');
  if (sc && S.vault) {
    var sa = sc.dataset.sc, sid = sc.dataset.id, entry = S.vault.data.entries.filter(function(x){ return x.id === sid; })[0];
    if (sa === 'new') { S.scEdit = null; renderSecret(); setTimeout(function(){ var t = $('se-title'); if (t) t.focus(); }, 50); }
    else if (sa === 'edit') { S.scEdit = sid; renderSecret(); var sf = $('sc-form'); if (sf) sf.scrollIntoView({behavior:'smooth', block:'center'}); }
    else if (sa === 'cancel-edit') { S.scEdit = undefined; renderSecret(); }
    else if (sa === 'gen') { $('se-pass').value = genPassword(); }
    else if (sa === 'toggle') { S.scShow[sid] = !S.scShow[sid]; renderSecret(); }
    else if (sa === 'copy-user' && entry) copyText(entry.user);
    else if (sa === 'copy-pass' && entry) copyText(entry.password);
    else if (sa === 'ask-del') { S.scConfirm = sid; renderSecret(); }
    else if (sa === 'cancel-del') { S.scConfirm = null; renderSecret(); }
    else if (sa === 'delete') { S.scConfirm = null; saveVault({entries:S.vault.data.entries.filter(function(x){ return x.id !== sid; })}, '削除しました'); }
    else if (sa === 'open-pw') { S.scPwForm = true; renderSecret(); }
    else if (sa === 'cancel-pw') { S.scPwForm = false; renderSecret(); }
    return;
  }

  var b = ev.target.closest('[data-action]'); if (!b || !S.m) return;
  var act = b.dataset.action;
  if (act === 'open-proj') { $('proj-form').hidden = false; $('pj-err').textContent = ''; $('pj-name').value = ''; $('pj-b0').value = ''; $('pj-b1').value = ''; $('pj-note').value = ''; setTimeout(function(){ $('pj-name').focus(); }, 50); }
  else if (act === 'close-proj') $('proj-form').hidden = true;
  else if (act === 'open-dep') openDepForm();
  else if (act === 'open-bal') openBalForm();
  else if (act === 'close-bal') $('bal-form').hidden = true;
  else if (act === 'open-extra') { $('extra-form').hidden = false; $('ex2-err').textContent = ''; $('ex2-amount').value = ''; $('ex2-reason').value = ''; $('ex2-date').value = S.f.today; $('extra-form').scrollIntoView({behavior:'smooth', block:'center'}); }
  else if (act === 'close-extra') $('extra-form').hidden = true;
  else if (act === 'close-dep') $('dep-form').hidden = true;
  else if (act === 'open-item') openItemForm(null);
  else if (act === 'close-item') $('item-form').hidden = true;
  else if (act === 'stop-item') { $('item-form').hidden = true; runFixed('updateFixedItem', [S.editItem, {active:false}], '来月から表示しません'); }
  else if (act === 'open-doc') { if (!S.docs) return; $('docfolder-form').hidden = true; $('doc-form').hidden = false; $('doc-err').textContent = ''; }
  else if (act === 'close-doc') $('doc-form').hidden = true;
  else if (act === 'open-docfolder') { $('doc-form').hidden = true; $('docfolder-form').hidden = false; $('docfolder-err').textContent = ''; setTimeout(function(){ $('docfolder-name').focus(); }, 50); }
  else if (act === 'close-docfolder') $('docfolder-form').hidden = true;
  else if (act === 'open-album-form') { var d = new Date(); $('album-form').hidden = false; $('album-err').textContent = ''; $('album-name').value = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + ' '; setTimeout(function(){ $('album-name').focus(); }, 50); }
  else if (act === 'close-album-form') $('album-form').hidden = true;
  else if (act === 'add-photos') { if (S.album) $('album-input').click(); }
  else if (act === 'close-viewer') closeViewer();
});
document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') closeViewer(); });

/* ---------- 日付の計算 ---------- */
var DAY = 86400000, DOW_JA = '日月火水木金土';
function ymdToDate(s){ var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function todayDate(){ var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a, b){ return Math.round((b - a) / DAY); }
function mdLabel(d){ return (d.getMonth() + 1) + '/' + d.getDate() + '（' + DOW_JA.charAt(d.getDay()) + '）'; }

/* ---------- 記念日 ---------- */
function anniversaryInfo(){
  if (!S.h || !S.h.anniversary) return null;
  var start = ymdToDate(S.h.anniversary), today = todayDate();
  var days = daysBetween(start, today);
  var next = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate());
  var years = next.getFullYear() - start.getFullYear();
  var nextHundred = Math.ceil((days + 1) / 100) * 100;
  var y = today.getFullYear() - start.getFullYear(), m = today.getMonth() - start.getMonth(), dd = today.getDate() - start.getDate();
  if (dd < 0) m--;
  if (m < 0) { y--; m += 12; }
  return {start:start, days:days, next:next, years:years, untilNext:daysBetween(today, next), nextHundred:nextHundred, untilHundred:nextHundred - days,
    y:y, m:m, totalMonths:y * 12 + m, monthDay: today.getDate() === start.getDate(), label:S.h.anniversaryLabel || '付き合って'};
}

/* ---------- ごみの日 ---------- */
function garbageOn(d){
  if (!S.h) return [];
  var dow = d.getDay(), nth = Math.ceil(d.getDate() / 7);
  return S.h.garbage.filter(function(g){ return g.days.indexOf(dow) >= 0 && (!g.nths.length || g.nths.indexOf(nth) >= 0); });
}
function nextGarbage(fromDate){
  for (var i = 0; i < 14; i++) {
    var d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
    var g = garbageOn(d); if (g.length) return {date:d, kinds:g, offset:i};
  }
  return null;
}
function weekdayText(g){ return g.days.map(function(i){ return DOW_JA.charAt(i); }).join('・') + '曜' + (g.nths.length ? '（第' + g.nths.join('・第') + '）' : ''); }

/* ---------- ホームのお知らせ ---------- */
function renderNotices(){
  if (!S.h) return;
  var today = todayDate(), out = [];
  var a = anniversaryInfo();
  if (a) {
    $('greet-anniv').hidden = false;
    $('greet-anniv').textContent = a.label + ' ' + (a.y ? a.y + '年' : '') + a.m + 'ヶ月（' + a.days.toLocaleString('ja-JP') + '日）';
    if (a.untilNext === 0) out.push({tag:'anniv', t:'記念日', body:'今日で' + esc(a.label) + a.years + '年！ ' + a.years + '周年の記念日です 🎉'});
    else if (a.monthDay) out.push({tag:'anniv', t:'記念日', body:'今日で' + esc(a.label) + a.totalMonths + 'ヶ月 🎉'});
    else if (a.untilNext <= 30) out.push({tag:'anniv', t:'記念日', body:a.years + '周年の記念日まで あと' + a.untilNext + '日', sub:mdLabel(a.next)});
    else if (a.untilHundred <= 7) out.push({tag:'anniv', t:'記念日', body:esc(a.label) + a.nextHundred.toLocaleString('ja-JP') + '日まで あと' + a.untilHundred + '日'});
  }
  var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  var tg = garbageOn(tomorrow);
  var gomiTable = S.showGomi ? '<div class="gomi-table">' + S.h.garbage.map(function(g){ return '<div>' + esc(g.kind) + '：' + weekdayText(g) + (g.time ? '・' + esc(g.time) : '') + '</div>'; }).join('') + '<div>' + esc(S.h.garbageArea) + '・年末年始は日程が変わります</div></div>' : '';
  if (tg.length) {
    out.push({tag:'gomi', t:'ごみ', click:'gomi', body:'明日 ' + mdLabel(tomorrow) + ' は <b>' + tg.map(function(g){ return esc(g.kind); }).join('・') + '</b>',
      sub:(tg.map(function(g){ return [g.time, g.memo].filter(Boolean).join('・'); }).filter(Boolean).join(' ／ ') || '') + gomiTable});
  } else if (S.h.garbage.length) {
    var ng = nextGarbage(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1));
    if (ng) out.push({tag:'gomi', t:'ごみ', click:'gomi', body:'明日はごみの日ではありません', sub:'次は ' + mdLabel(ng.date) + ' の' + ng.kinds.map(function(g){ return esc(g.kind); }).join('・') + gomiTable});
  }
  S.h.warranties.forEach(function(w){
    if (!w.date) return;
    var left = daysBetween(today, ymdToDate(w.date));
    if (left >= 0 && left <= 60) out.push({tag:'war', t:'保証', go:'docs', body:'「' + esc(w.name) + '」の保証が ' + mdLabel(ymdToDate(w.date)) + ' に切れます', sub:'あと' + left + '日' + (w.memo ? '・' + esc(w.memo) : '')});
    else if (left < 0 && left >= -30) out.push({tag:'war', t:'保証', go:'docs', body:'「' + esc(w.name) + '」の保証が切れました', sub:mdLabel(ymdToDate(w.date)) + 'まで'});
  });
  $('notices').innerHTML = out.map(function(n){
    var attr = n.click ? ' data-notice="' + n.click + '"' : (n.go ? ' data-go="' + n.go + '"' : '');
    return '<button class="notice" type="button"' + attr + '><span class="n-tag ' + n.tag + '">' + n.t + '</span><span class="n-body">' + n.body + (n.sub ? '<div class="n-sub">' + n.sub + '</div>' : '') + '</span></button>';
  }).join('');
}

/* ---------- 買い物リスト ---------- */
function runShop(fn, args, okMsg){
  setBusy(true);
  return api.apply(null, [fn].concat(args)).then(function(d){ S.h.shop = d; setBusy(false); renderShop(); if (okMsg) toast(okMsg); })
    .catch(function(e){ setBusy(false); toast(errMsg(e)); });
}
function renderShop(){
  if (!S.h) return;
  var open = S.h.shop.filter(function(x){ return !x.done; }), done = S.h.shop.filter(function(x){ return x.done; });
  var row = function(x){
    return '<div class="row' + (x.done ? ' done' : '') + '"><button class="check' + (x.done ? ' on' : '') + '" type="button" data-shop="toggle" data-id="' + esc(x.id) + '" aria-label="' + esc(x.name) + (x.done ? 'を戻す' : 'をカゴに入れた') + '">' + (x.done ? '✓' : '') + '</button>' +
      '<div class="main"><div class="title">' + esc(x.name) + '</div><div class="sub">' + (x.memo ? '<span>' + esc(x.memo) + '</span>' : '') + (x.by ? '<span>' + esc(x.by) + 'が追加</span>' : '') + '</div></div>' +
      '<button class="icon-btn" type="button" data-shop="delete" data-id="' + esc(x.id) + '" aria-label="' + esc(x.name) + 'を消す">×</button></div>';
  };
  $('shop-list').innerHTML = open.length ? open.map(row).join('') : '<div class="empty">買うものはありません。上の入力欄から追加できます。</div>';
  $('shop-done-title').textContent = done.length ? 'カゴに入れたもの（' + done.length + '）' : '';
  $('shop-clear').hidden = !done.length;
  $('shop-done').hidden = !done.length;
  $('shop-done').innerHTML = done.map(row).join('');
}
$('shop-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var n = $('sh-name').value.trim();
  if (!n) { $('sh-err').textContent = '買うものを入れてください。'; return; }
  var memo = $('sh-memo').value.trim();
  $('sh-name').value = ''; $('sh-memo').value = ''; $('sh-err').textContent = '';
  runShop('addShop', [n, memo]).then(function(){ var i = $('sh-name'); if (i) i.focus(); });
});

/* ---------- 保証期限 ---------- */
function renderWarranties(){
  if (!S.h) return;
  var today = todayDate();
  var list = S.h.warranties.slice().sort(function(a, b){ return (a.date || '9').localeCompare(b.date || '9'); });
  $('war-list').innerHTML = !list.length ? '<div class="empty">家電の保証書を入れたら、保証期限も登録しておくと、切れる60日前からホームでお知らせします。</div>' :
    list.map(function(w){
      var left = w.date ? daysBetween(today, ymdToDate(w.date)) : null, c = S.confirmWar === w.id;
      var state = left == null ? '' : (left < 0 ? '<span class="due-over">切れています</span>' : (left <= 60 ? '<span class="due-over">あと' + left + '日</span>' : '<span>あと' + left + '日</span>'));
      return '<div class="row"><div class="main"><div class="title">' + esc(w.name) + '</div><div class="sub"><span>' + (w.date ? w.date.replace(/-/g, '/') + 'まで' : '') + '</span>' + state + (w.memo ? '<span>' + esc(w.memo) + '</span>' : '') + '</div></div>' +
        '<button class="link-btn" type="button" data-war="edit" data-id="' + esc(w.id) + '">編集</button>' +
        (c ? '<button class="small-btn danger" type="button" data-war="delete" data-id="' + esc(w.id) + '">削除</button><button class="small-btn" type="button" data-war="cancel">戻す</button>'
           : '<button class="icon-btn" type="button" data-war="ask-del" data-id="' + esc(w.id) + '" aria-label="' + esc(w.name) + 'の保証期限を削除">×</button>') + '</div>';
    }).join('');
}
function openWarForm(w, file){
  S.warEdit = w ? w.id : null; S.warFile = w ? w.fileId : (file ? file.id : '');
  $('war-form').hidden = false; $('war-err').textContent = '';
  $('war-title').textContent = w ? '「' + w.name + '」の保証期限' : (file ? '「' + file.name + '」の保証期限を登録' : '保証期限を登録');
  $('war-name').value = w ? w.name : (file ? file.name.replace(/\.[^.]+$/, '') : '');
  $('war-date').value = w ? w.date : '';
  $('war-memo').value = w ? w.memo : '';
  $('war-form').scrollIntoView({behavior:'smooth', block:'center'});
  setTimeout(function(){ $('war-date').focus(); }, 250);
}
$('war-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var w = {id:S.warEdit || '', fileId:S.warFile || '', name:$('war-name').value.trim(), date:$('war-date').value, memo:$('war-memo').value.trim()};
  if (!w.name) { $('war-err').textContent = '品名を入れてください。'; return; }
  if (!w.date) { $('war-err').textContent = '保証期限の日付を入れてください。'; return; }
  $('war-form').hidden = true; setBusy(true);
  api('setWarranty', w).then(function(d){ S.h.warranties = d; setBusy(false); renderWarranties(); if (S.docs) renderDocs(); toast('保証期限を保存しました'); })
    .catch(function(e){ setBusy(false); $('war-form').hidden = false; $('war-err').textContent = errMsg(e); });
});
function warrantyFor(fileId){ return S.h ? S.h.warranties.filter(function(w){ return w.fileId === fileId; })[0] : null; }

document.addEventListener('click', function(ev){
  var nt = ev.target.closest('[data-notice="gomi"]'); if (nt) { S.showGomi = !S.showGomi; renderNotices(); return; }
  if (S.busy) return;
  var sb = ev.target.closest('[data-shop]');
  if (sb) {
    var id = sb.dataset.id, x = S.h.shop.filter(function(i){ return i.id === id; })[0];
    if (sb.dataset.shop === 'toggle' && x) {
      x.done = !x.done; renderShop();
      api('toggleShop', id, x.done).then(function(d){ S.h.shop = d; if (S.view === 'shop') renderShop(); })
        .catch(function(e){ x.done = !x.done; if (S.view === 'shop') renderShop(); toast(errMsg(e)); });
    }
    else if (sb.dataset.shop === 'delete') runShop('deleteShop', [id]);
    return;
  }
  var wb = ev.target.closest('[data-war]');
  if (wb) {
    var wid = wb.dataset.id, w = S.h.warranties.filter(function(i){ return i.id === wid; })[0];
    if (wb.dataset.war === 'edit' && w) openWarForm(w);
    else if (wb.dataset.war === 'ask-del') { S.confirmWar = wid; renderWarranties(); }
    else if (wb.dataset.war === 'cancel') { S.confirmWar = null; renderWarranties(); }
    else if (wb.dataset.war === 'delete') {
      S.confirmWar = null; setBusy(true);
      api('deleteWarranty', wid).then(function(d){ S.h.warranties = d; setBusy(false); renderWarranties(); if (S.docs) renderDocs(); toast('削除しました'); })
        .catch(function(e){ setBusy(false); toast(errMsg(e)); });
    }
    return;
  }
  var wf = ev.target.closest('[data-war-file]');
  if (wf) { ev.stopPropagation(); openWarForm(warrantyFor(wf.dataset.warFile), {id:wf.dataset.warFile, name:wf.dataset.name}); return; }
  var b = ev.target.closest('[data-action]'); if (!b) return;
  if (b.dataset.action === 'clear-shop') runShop('clearShopDone', [], 'カゴに入れたものを消しました');
  else if (b.dataset.action === 'open-war') openWarForm(null, null);
  else if (b.dataset.action === 'close-war') $('war-form').hidden = true;
}, true);

/* ---------- カレンダー ---------- */
var CAL_UP_KEY = 'futari-cal-up';
S.calCache = {};
function ymd(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function calRangeFor(ym){
  var p = ym.split('-'), first = new Date(+p[0], +p[1] - 1, 1), start = addDays(first, -first.getDay());
  return {from:ymd(start), to:ymd(addDays(start, 41)), start:start};
}
function eventsOn(day, events){
  return (events || []).filter(function(e){ return e.date <= day && day <= e.endDate; }).sort(function(a, b){
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (a.start || '').localeCompare(b.start || '');
  });
}
function loadUpcoming(){
  if (!S.up) { try { S.up = JSON.parse(lsGet(CAL_UP_KEY) || 'null'); } catch(e) {} }
  var t = todayDate();
  return api('getEvents', ymd(t), ymd(addDays(t, 13))).then(function(d){
    S.up = d; S.upErr = false; lsSet(CAL_UP_KEY, JSON.stringify(d)); if (S.view === 'home') renderCalTile();
  }).catch(function(){ S.upErr = true; if (S.view === 'home') renderCalTile(); });
}
function dayWord(k){
  var t = todayDate();
  if (k === ymd(t)) return '今日';
  if (k === ymd(addDays(t, 1))) return '明日';
  return mdLabel(ymdToDate(k));
}
function renderCalTile(){
  var el = $('tile-cal'); if (!el) return;
  var head = '<div class="t-head"><span class="t-name">カレンダー</span><span class="t-go">開く →</span></div>';
  if (!S.up) { el.innerHTML = head + '<div class="t-sub">' + (S.upErr ? 'まだ予定を読み込めていません' : '読み込み中…') + '</div>'; return; }
  var today = ymd(todayDate());
  var hol = S.up.holidays.filter(function(h){ return h.date === today; })[0];
  var list = S.up.events.filter(function(e){ return e.endDate >= today; }).map(function(e){
    var k = e.date < today ? today : e.date;
    return {e:e, k:k, sort:k + (e.allDay ? ' ' : e.date < today ? ' ' : e.start)};
  }).sort(function(a, b){ return a.sort.localeCompare(b.sort); }).slice(0, 4);
  el.innerHTML = head + (hol ? '<div class="t-sub">今日は' + esc(hol.name) + '</div>' : '') +
    (list.length ? '<div class="cal-rows">' + list.map(function(x){
      var e = x.e, time = e.allDay ? '' : (e.date < today ? '' : ' ' + e.start);
      return '<div class="cal-row"><span class="when">' + dayWord(x.k) + time + '</span><span class="pdot ' + ownerCls(e.who) + '"></span><span class="tt">' + esc(e.title) + '</span></div>';
    }).join('') + '</div>' : '<div class="t-sub">これから2週間の予定はありません</div>');
}
function openCal(){
  if (!S.calMonth) { var t = todayDate(); S.calMonth = ymd(t).slice(0, 7); S.calSel = ymd(t); }
  renderCal(); fetchCal();
}
function calKey(){ var r = calRangeFor(S.calMonth); return r.from + '_' + r.to; }
function fetchCal(){
  var r = calRangeFor(S.calMonth), key = r.from + '_' + r.to;
  return api('getEvents', r.from, r.to).then(function(d){ S.calCache[key] = d; if (S.view === 'cal' && calKey() === key) renderCal(); })
    .catch(function(e){ if (S.view === 'cal' && !S.calCache[key]) $('cal-day-list').innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>'; });
}
function setEvWho(w){ S.evWho = w; Array.prototype.forEach.call($('ev-who').querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.evwho === w)); }); }
function renderCal(){
  if (!S.me || !S.calMonth) return;
  var r = calRangeFor(S.calMonth), d = S.calCache[r.from + '_' + r.to], p = S.calMonth.split('-'), month = +p[1] - 1;
  $('cal-month').textContent = p[0] + '年' + (+p[1]) + '月';
  var today = ymd(todayDate()), hol = {};
  if (d) d.holidays.forEach(function(h){ hol[h.date] = h.name; });
  var anniv = S.h && S.h.anniversary ? +S.h.anniversary.split('-')[2] : 0;
  var html = '日月火水木金土'.split('').map(function(w, i){ return '<div class="cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>'; }).join('');
  for (var i = 0; i < 42; i++) {
    var day = addDays(r.start, i), k = ymd(day), evs = d ? eventsOn(k, d.events) : [], other = day.getMonth() !== month;
    var cls = 'cal-day' + (other ? ' other' : '') + (k === today ? ' today' : '') + (k === S.calSel ? ' sel' : '') + (day.getDay() === 0 || hol[k] ? ' sun' : day.getDay() === 6 ? ' sat' : '');
    html += '<button type="button" class="' + cls + '" data-calday="' + k + '" aria-label="' + (day.getMonth() + 1) + '月' + day.getDate() + '日' + (evs.length ? '、予定' + evs.length + '件' : '') + '">' +
      '<span class="d">' + day.getDate() + '</span>' + (hol[k] ? '<span class="hol">' + esc(hol[k]) + '</span>' : '') +
      '<span class="dots">' + evs.slice(0, 4).map(function(e){ return '<span class="pdot ' + ownerCls(e.who) + '"></span>'; }).join('') + '</span>' +
      (anniv && !other && day.getDate() === anniv ? '<span class="anniv" aria-hidden="true">♡</span>' : '') + '</button>';
  }
  $('cal-grid').innerHTML = html;
  $('cal-legend').innerHTML = S.me.members.concat([OWNERS_BOTH]).map(function(n){ return '<span><span class="pdot ' + ownerCls(n) + '"></span>' + esc(n) + '</span>'; }).join('');
  if (!$('ev-who').children.length) {
    $('ev-who').innerHTML = S.me.members.concat([OWNERS_BOTH]).map(function(n){ return '<button type="button" class="' + ownerCls(n) + '" data-evwho="' + esc(n) + '" aria-pressed="false">' + esc(n) + '</button>'; }).join('');
  }
  var sel = S.calSel;
  $('cal-day-title').textContent = dayWord(sel) === '今日' || dayWord(sel) === '明日' ? dayWord(sel) + ' ' + mdLabel(ymdToDate(sel)) : mdLabel(ymdToDate(sel));
  if (hol[sel]) $('cal-day-title').textContent += '・' + hol[sel];
  if (!d) { $('cal-day-list').innerHTML = '<div class="empty">読み込み中…</div>'; return; }
  var list = eventsOn(sel, d.events);
  $('cal-day-list').innerHTML = !list.length ? '<div class="empty">予定はありません</div>' : list.map(function(e){
    return '<button class="row ev-row" type="button" data-ev="' + esc(e.id) + '"><div class="ev-time num">' + (e.allDay ? '終日' : esc(e.start) + '<br><span>〜' + esc(e.end) + '</span>') + '</div>' +
      '<div class="main"><div class="title">' + esc(e.title) + '</div><div class="sub"><span class="chip ' + ownerCls(e.who) + '">' + esc(e.who) + '</span>' +
      (e.endDate !== e.date ? '<span>' + md(e.date) + '〜' + md(e.endDate) + '</span>' : '') + (e.location ? '<span>' + esc(e.location) + '</span>' : '') + (e.recurring ? '<span>くり返し</span>' : '') + '</div>' +
      (e.memo ? '<div class="sub">' + esc(e.memo) + '</div>' : '') + '</div></button>';
  }).join('');
}
function syncAllDay(){ var a = $('ev-allday').checked; $('ev-time-field').hidden = a; $('ev-enddate-field').hidden = !a; }
function plusHour(t){ var p = t.split(':'), h = (+p[0] + 1) % 24; return ('0' + h).slice(-2) + ':' + p[1]; }
function openEvForm(e){
  if (e && e.recurring) { toast('くり返しの予定は、Googleカレンダーのアプリで編集してください'); return; }
  S.evEdit = e ? e.id : null; S.evDelAsk = false;
  $('ev-form').hidden = false; $('ev-err').textContent = '';
  $('ev-form-title').textContent = e ? '予定を編集' : '予定を追加';
  $('ev-title').value = e ? e.title : '';
  setEvWho(e ? e.who : OWNERS_BOTH);
  $('ev-allday').checked = e ? e.allDay : false;
  $('ev-date').value = e ? e.date : S.calSel;
  $('ev-enddate').value = e && e.allDay && e.endDate !== e.date ? e.endDate : '';
  $('ev-start').value = e && !e.allDay ? e.start : '19:00';
  $('ev-end').value = e && !e.allDay ? e.end : '20:00';
  $('ev-loc').value = e ? e.location : ''; $('ev-memo').value = e ? e.memo : '';
  $('ev-delete').hidden = !e; $('ev-delete').textContent = 'この予定を削除';
  syncAllDay();
  $('ev-form').scrollIntoView({behavior:'smooth', block:'center'});
  if (!e) setTimeout(function(){ $('ev-title').focus(); }, 250);
}
$('ev-allday').addEventListener('change', syncAllDay);
$('ev-start').addEventListener('change', function(){ if (this.value && (!$('ev-end').value || $('ev-end').value <= this.value)) $('ev-end').value = plusHour(this.value); });
function calSaved(d, toastMsg, date){
  var r = calRangeFor(S.calMonth); S.calCache[r.from + '_' + r.to] = d;
  setBusy(false); $('ev-form').hidden = true;
  if (date && date.slice(0, 7) !== S.calMonth) { S.calMonth = date.slice(0, 7); S.calSel = date; renderCal(); fetchCal(); }
  else { if (date) S.calSel = date; renderCal(); }
  toast(toastMsg); loadUpcoming();
}
$('ev-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  var x = {title:$('ev-title').value.trim(), who:S.evWho || OWNERS_BOTH, allDay:$('ev-allday').checked, date:$('ev-date').value,
    endDate:$('ev-enddate').value, start:$('ev-start').value, end:$('ev-end').value, location:$('ev-loc').value.trim(), memo:$('ev-memo').value.trim()};
  if (!x.title) { $('ev-err').textContent = '予定の名前を入れてください。'; return; }
  if (!x.date) { $('ev-err').textContent = '日付を入れてください。'; return; }
  if (x.allDay && x.endDate && x.endDate < x.date) { $('ev-err').textContent = '終わりの日は始まりの日より後にしてください。'; return; }
  if (!x.allDay && (!x.start || !x.end)) { $('ev-err').textContent = '開始と終了の時間を入れてください。'; return; }
  var r = calRangeFor(S.calMonth), rng = {from:r.from, to:r.to};
  setBusy(true);
  (S.evEdit ? api('updateEvent', S.evEdit, x, rng) : api('addEvent', x, rng))
    .then(function(d){ calSaved(d, S.evEdit ? '予定を保存しました' : '「' + x.title + '」を追加しました', x.date); })
    .catch(function(e){ setBusy(false); $('ev-err').textContent = errMsg(e); });
});

document.addEventListener('click', function(ev){
  var cm = ev.target.closest('[data-calmonth]');
  if (cm) {
    var p = S.calMonth.split('-'), d = new Date(+p[0], +p[1] - 1 + Number(cm.dataset.calmonth), 1);
    S.calMonth = ymd(d).slice(0, 7);
    var t = todayDate(); S.calSel = ymd(t).slice(0, 7) === S.calMonth ? ymd(t) : ymd(d);
    $('ev-form').hidden = true; renderCal(); fetchCal(); return;
  }
  var cd = ev.target.closest('[data-calday]');
  if (cd) {
    S.calSel = cd.dataset.calday;
    if (S.calSel.slice(0, 7) !== S.calMonth) { S.calMonth = S.calSel.slice(0, 7); renderCal(); fetchCal(); } else renderCal();
    if (!$('ev-form').hidden && !S.evEdit) $('ev-date').value = S.calSel;
    return;
  }
  var ew = ev.target.closest('[data-evwho]'); if (ew) { setEvWho(ew.dataset.evwho); return; }
  if (S.busy) return;
  var er = ev.target.closest('[data-ev]');
  if (er) {
    var data = S.calCache[calKey()];
    var e = data && data.events.filter(function(x){ return x.id === er.dataset.ev; })[0];
    if (e) openEvForm(e);
    return;
  }
  var b = ev.target.closest('[data-action]'); if (!b) return;
  if (b.dataset.action === 'open-ev') openEvForm(null);
  else if (b.dataset.action === 'close-ev') $('ev-form').hidden = true;
  else if (b.dataset.action === 'delete-ev' && S.evEdit) {
    if (!S.evDelAsk) { S.evDelAsk = true; b.textContent = 'もう一度押すと削除'; return; }
    var r = calRangeFor(S.calMonth);
    setBusy(true);
    api('deleteEvent', S.evEdit, {from:r.from, to:r.to}).then(function(d){ calSaved(d, '予定を削除しました'); })
      .catch(function(e){ setBusy(false); $('ev-err').textContent = errMsg(e); });
  }
}, true);

/* ---------- 共通のクリック処理 ---------- */
document.addEventListener('submit', function(ev){
  var f = ev.target.closest('[data-form="est"]'); if (!f) return;
  ev.preventDefault();
  var raw = $('est-input').value.trim();
  if (raw !== '' && !(Number(raw) >= 0)) { toast('予算は0以上の数字で入れてください'); return; }
  var id = f.dataset.id; S.editWish = null;
  runMoney('setWishEstimate', [id, raw], '予算を保存しました');
});

document.addEventListener('click', function(ev){
  var g = ev.target.closest('[data-go]'); if (g) { if (S.m) go(g.dataset.go); return; }
  var pb = ev.target.closest('[data-payer]'); if (pb) { setPayer(pb.dataset.payer); return; }
  var pr = ev.target.closest('[data-pri]'); if (pr) { setPri(pr.dataset.pri); return; }
  var ow = ev.target.closest('[data-owner]'); if (ow) { setOwner(ow.dataset.owner); return; }
  var fl = ev.target.closest('[data-filter]'); if (fl) { S.tdFilter = fl.dataset.filter; renderTodo(); return; }
  var rf = ev.target.closest('[data-refresh]'); if (rf) {
    if (S.busy) return;
    var what = rf.dataset.refresh;
    if (what === 'docs') { S.docs = null; openDocs(); return; }
    if (what === 'photos') { S.albums = null; openPhotos(); return; }
    if (what === 'cal') { setBusy(true); Promise.all([fetchCal(), loadUpcoming()]).then(function(){ setBusy(false); toast('最新の状態にしました'); }); return; }
    setBusy(true); loadAll(true).then(function(){ setBusy(false); toast('最新の状態にしました'); }); return;
  }
  var b = ev.target.closest('[data-action]'); if (!b || S.busy || !S.m) return;
  var a = b.dataset.action, id = b.dataset.id;
  if (a === 'open-exp') openExp(null);
  else if (a === 'close-exp') closeExp();
  else if (a === 'open-wish') { closeExp(); $('wish-form').hidden = false; $('wi-err').textContent = ''; $('wi-item').value = ''; $('wi-note').value = ''; $('wi-est').value = ''; setPri('あとででOK'); setTimeout(function(){ $('wi-item').focus(); }, 50); }
  else if (a === 'close-wish') $('wish-form').hidden = true;
  else if (a === 'ask-del-exp') { S.confirmExp = id; S.confirmWish = null; renderMoney(); }
  else if (a === 'ask-del-wish') { S.confirmWish = id; S.confirmExp = null; renderMoney(); }
  else if (a === 'ask-del-todo') { S.confirmTodo = id; renderTodo(); }
  else if (a === 'cancel') { S.confirmExp = S.confirmWish = S.confirmTodo = null; if (S.view === 'todo') renderTodo(); else renderMoney(); }
  else if (a === 'del-exp') { S.confirmExp = null; runMoney('deleteExpense', [id], '削除しました'); }
  else if (a === 'del-wish') { S.confirmWish = null; runMoney('deleteWish', [id], '削除しました'); }
  else if (a === 'del-todo') { S.confirmTodo = null; runTodo('deleteTodo', [id], '削除しました'); }
  else if (a === 'edit-est') { S.editWish = id; renderMoney(); }
  else if (a === 'buy') { var w = S.m.wishes.filter(function(x){ return x.id === id; })[0]; if (w) openExp(w); }
  else if (a === 'toggle-todo') {
    var x = S.t.items.filter(function(i){ return i.id === id; })[0];
    if (x) {
      x.done = !x.done; x.doneAt = x.done ? S.t.today : ''; renderTodo(); toast(x.done ? '「' + x.title + '」完了！' : '未完了に戻しました');
      api('setTodoDone', id, x.done).then(function(d){ S.t = d; if (S.view === 'todo') renderTodo(); })
        .catch(function(e){ x.done = !x.done; if (S.view === 'todo') renderTodo(); toast(errMsg(e)); });
    }
  }
});
document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && S.editWish) { S.editWish = null; renderMoney(); } });
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible' && S.m && !S.busy) loadAll(); });
$('logout-btn').addEventListener('click', function(){ if (!S.busy) logout(); });
$('copy-url').addEventListener('click', function(){ copyText(location.origin + location.pathname); });

if (!CFG.apiUrl || !CFG.clientId || /ここに/.test(CFG.apiUrl + CFG.clientId)) {
  banner('準備中です。config.js に窓口のURLとクライアントIDが入ると使えるようになります。', true);
} else {
  loadAll();
}
})();
