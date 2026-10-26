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
      if (res.ok) return res.data;
      if (res.code === 'auth' || res.code === 'forbidden') { setSession(''); showLogin(res.error); }
      var e = new Error(res.error || 'うまくいきませんでした。'); e.code = res.code; throw e;
    });
}
var call = api;
function errMsg(e){ return (e && e.message ? e.message : String(e)).replace(/^(Error|Exception):\s*/, ''); }
function setBusy(b){ S.busy = b; $('app').classList.toggle('busy', b); }

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
var VIEWS = ['home','money','todo'];
function viewFromHash(){ var h = (location.hash || '').replace('#', ''); return VIEWS.indexOf(h) >= 0 ? h : 'home'; }
function show(view){
  S.view = view;
  $('v-login').hidden = true;
  VIEWS.forEach(function(v){ $('v-' + v).hidden = v !== view; });
  if (view === 'home') renderHome();
  if (view === 'money') renderMoney();
  if (view === 'todo') renderTodo();
  window.scrollTo(0, 0);
}
function go(view){
  var target = view === 'home' ? '' : view;
  if ((location.hash || '').replace('#', '') === target) show(view); else location.hash = target;
}
window.addEventListener('hashchange', function(){ if (S.m) show(viewFromHash()); });

/* ---------- ログイン ---------- */
function showLogin(msg){
  S.m = null;
  VIEWS.forEach(function(v){ $('v-' + v).hidden = true; });
  banner(null);
  $('v-login').hidden = false;
  $('login-msg').textContent = msg || '';
  $('login-msg').hidden = !msg;
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
  var done = function(){ setSession(''); try { google.accounts.id.disableAutoSelect(); } catch(e) {} S.photoAsked = false; S.photo = null; renderPhoto(); showLogin('ログアウトしました。'); };
  api('logout').then(done, done);
}

/* ---------- 読み込み ---------- */
function loadAll(){
  if (!getSession()) { showLogin(); return Promise.resolve(); }
  return call('getAll').then(function(d){
    S.me = d.me; S.m = d.money; S.t = d.todos; S.folders = d.folders; banner(null);
    var names = S.m.projects.map(function(p){ return p.name; });
    if (names.indexOf(S.project) < 0) {
      var saved = ''; try { saved = localStorage.getItem('futari-project') || ''; } catch(e) {}
      var active = S.m.projects.filter(function(p){ return p.status === '進行中'; })[0];
      S.project = names.indexOf(saved) >= 0 ? saved : (active ? active.name : (names[0] || ''));
    }
    if (!S.payer || S.m.members.indexOf(S.payer) < 0) S.payer = S.m.meMember || S.m.members[0] || '';
    if (!S.tdOwner) S.tdOwner = S.me.member || OWNERS_BOTH;
    buildStatic();
    show(viewFromHash());
    if (!S.photoAsked) { S.photoAsked = true; loadPhoto(); }
  }).catch(function(e){
    if (e && (e.code === 'auth' || e.code === 'forbidden')) return;
    banner('読み込めませんでした。' + errMsg(e), true);
  });
}

function buildStatic(){
  var m = S.m;
  $('project').innerHTML = m.projects.map(function(p){ return '<option' + (p.name === S.project ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
  var opts = m.categories.map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('');
  $('ex-cat').innerHTML = opts; $('wi-cat').innerHTML = opts;
  $('ex-payer').innerHTML = m.members.map(function(n, i){ return '<button type="button" class="m' + i + '" data-payer="' + esc(n) + '" aria-pressed="' + (n === S.payer) + '">' + esc(n) + '</button>'; }).join('');
  var owners = S.me.members.concat([OWNERS_BOTH]);
  $('td-owner').innerHTML = owners.map(function(o){ return '<button type="button" class="' + ownerCls(o) + '" data-owner="' + esc(o) + '" aria-pressed="' + (o === S.tdOwner) + '">' + esc(o) + '</button>'; }).join('');
  $('td-filters').innerHTML = ['すべて'].concat(owners).map(function(o){ return '<button type="button" data-filter="' + esc(o) + '" aria-pressed="' + (o === S.tdFilter) + '">' + esc(o) + '</button>'; }).join('');
  $('money-sheet-link').innerHTML = '<a href="' + esc(m.sheetUrl) + '" target="_blank" rel="noopener">台帳をスプレッドシートで開く</a>';
  $('todo-sheet-link').innerHTML = '<a href="' + esc(S.t.sheetUrl) + '" target="_blank" rel="noopener">やることをスプレッドシートで開く</a>';
  $('tile-docs').href = S.folders.docs; $('tile-photos').href = S.folders.photos; $('root-link').href = S.folders.root;
}

/* ---------- ホーム ---------- */
function renderHome(){
  if (!S.m) return;
  renderClock();

  var t = moneyTotals(), M = S.m.members, left = t.total - t.used;
  var segs = M.map(function(n, i){ return '<span class="seg-m' + i + '" style="width:' + pct(t.spent[n], Math.max(t.total, t.used)) + '%"></span>'; }).join('');
  $('tile-money').innerHTML =
    '<div class="t-head"><span class="t-name">お金</span><span class="t-go">開く →</span></div>' +
    '<div class="t-sub">' + esc(S.project) + ' の残り</div>' +
    '<div class="t-big num' + (left < 0 ? ' over' : '') + '">' + sYen(left) + '</div>' +
    '<div class="bar thin">' + segs + '</div>' +
    '<div class="t-sub num">' + M.map(function(n){ return esc(n) + ' ' + yen(t.spent[n]); }).join('　') + '　／ 予算 ' + man(t.total) + '</div>';

  var open = openTodos(), today = S.t.today;
  var over = open.filter(function(x){ return x.due && x.due < today; }).length;
  var top = open.slice(0, 3);
  $('tile-todo').innerHTML =
    '<div class="t-head"><span class="t-name">やること</span><span class="t-go">開く →</span></div>' +
    '<div class="t-big num">' + open.length + '<span class="t-sub" style="font-size:14px;margin-left:6px">件 残っています' + (over ? '（期限切れ ' + over + '件）' : '') + '</span></div>' +
    (top.length ? '<div class="mini-todo">' + top.map(function(x){
      return '<div><span class="chip ' + ownerCls(x.owner) + '">' + esc(x.owner || '未定') + '</span><span class="tt">' + esc(x.title) + '</span>' + (x.due ? '<span class="t-sub' + (x.due < today ? ' due-over' : '') + '">' + md(x.due) + '</span>' : '') + '</div>';
    }).join('') + '</div>' : '<div class="t-sub">全部終わりました</div>');
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
function loadPhoto(){
  call('getHomePhoto').then(function(p){ S.photo = p; renderPhoto(); }).catch(function(){});
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
  shrinkImage(f, 1400, 0.82).then(function(dataUrl){ return call('uploadHomePhoto', dataUrl, f.name); })
    .then(function(p){ S.photo = p; setBusy(false); renderPhoto(); toast('ホームの写真に追加しました'); })
    .catch(function(e){ setBusy(false); toast(errMsg(e) || '写真を保存できませんでした。'); });
});

/* ---------- お金 ---------- */
function proj(){ return S.m.projects.filter(function(p){ return p.name === S.project; })[0] || {budgets:{}, note:''}; }
function exps(){ return S.m.expenses.filter(function(e){ return e.project === S.project; }); }
function wishesAll(){ return S.m.wishes.filter(function(w){ return w.project === S.project; }); }
function wishesOpen(){ return wishesAll().filter(function(w){ return w.status !== '購入済み'; }); }
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
$('project').addEventListener('change', function(){
  S.project = this.value; S.confirmExp = S.confirmWish = S.editWish = null;
  try { localStorage.setItem('futari-project', S.project); } catch(e) {}
  closeExp(); $('wish-form').hidden = true; renderMoney();
});

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
  var rf = ev.target.closest('[data-refresh]'); if (rf) { if (!S.busy) { setBusy(true); loadAll().then(function(){ setBusy(false); toast('最新の状態にしました'); }); } return; }
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
  else if (a === 'toggle-todo') { var x = S.t.items.filter(function(i){ return i.id === id; })[0]; if (x) runTodo('setTodoDone', [id, !x.done], x.done ? '未完了に戻しました' : '「' + x.title + '」完了！'); }
});
document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && S.editWish) { S.editWish = null; renderMoney(); } });
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible' && S.m && !S.busy) loadAll(); });
$('logout-btn').addEventListener('click', function(){ if (!S.busy) logout(); });

if (!CFG.apiUrl || !CFG.clientId || /ここに/.test(CFG.apiUrl + CFG.clientId)) {
  banner('準備中です。config.js に窓口のURLとクライアントIDが入ると使えるようになります。', true);
} else {
  loadAll();
}
})();
