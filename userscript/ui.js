  // ===== 以下运行在油猴沙箱：设置存储 + 悬浮面板 =====
  const TAG = 'xlb-chat-guard';
  const DEFAULTS = { enabled: true, blockEmotes: false, blockList: [], replyEnabled: true, replyList: [], replies: ['说得对，下次别说了', '你开心就好', '嗯嗯好的呢'], replyMode: 'random', cooldownSec: 8, perMinute: 4 };
  const gGet = (k, d) => { try { const v = GM_getValue(k); return v === undefined ? d : v; } catch { return d; } };
  const gSet = (k, v) => { try { GM_setValue(k, v); } catch {} };
  let S = Object.assign({}, DEFAULTS, gGet('settings', {}));
  const pageWin = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

  // 1) 注入页面上下文：优先 <script> 文本注入（真正的页面 realm，兼容 TM/VM/Firefox）；失败再退回 unsafeWindow 直接执行
  const code = '(' + PAGE_MAIN.toString() + ')();';
  try {
    const s = document.createElement('script');
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  } catch (e) {}
  if (!pageWin.__XLB_GUARD_INSTALLED__) {
    try { PAGE_MAIN.call(pageWin, pageWin); } catch (e) { console.warn('[聊天卫士] 注入失败', e); }
  }

  const pushSettings = () => window.postMessage({ src: TAG, dir: 'toPage', type: 'settings', data: JSON.parse(JSON.stringify(S)) }, '*');
  const save = () => { gSet('settings', S); pushSettings(); render(); };
  pushSettings();
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.src !== TAG || d.dir !== 'toBridge') return;
    if (d.type === 'ready') pushSettings();
    else if (d.type === 'speaker') {
      const list = gGet('speakers', []).filter((x) => x.playerId !== d.data.playerId);
      list.unshift(d.data); gSet('speakers', list.slice(0, 30)); renderSpeakers();
    } else if (d.type === 'blocked' || d.type === 'replied') {
      const st = gGet('stats', { blocked: 0, replied: 0 }); st[d.type] = (st[d.type] || 0) + 1; gSet('stats', st); renderStats();
    }
  });
  if (typeof GM_addValueChangeListener === 'function') GM_addValueChangeListener('settings', (k, o, n, remote) => { if (remote) { S = Object.assign({}, DEFAULTS, n || {}); pushSettings(); render(); } });

  // 2) 悬浮面板
  let root = null; const $ = (id) => root && root.querySelector('#xcg-' + id);
  const looksId = (v) => /^[A-Za-z0-9_-]{8,}$/.test(v);
  const same = (a, b) => a.playerId ? a.playerId === b.playerId : (!b.playerId && a.name === b.name);
  const label = (e) => e.playerId ? `${e.name || '?'}（${e.playerId}）` : `昵称：${e.name}`;
  function addTo(key, entry) { if (!S[key].some((e) => same(e, entry))) { S[key] = [...S[key], entry]; save(); } }
  const el = (tag, txt, cls) => { const x = document.createElement(tag); if (txt != null) x.textContent = txt; if (cls) x.className = cls; return x; };
  const CSS = `#xcg{position:fixed;z-index:2147483647;top:60px;right:20px;width:340px;max-height:80vh;overflow:auto;font:13px system-ui,"Microsoft YaHei",sans-serif;background:#0c0f0eee;color:#d6ded9;border:1px solid #2c3d36;border-radius:8px;box-shadow:0 6px 24px #000a}
#xcg .hd{cursor:move;user-select:none;padding:6px 10px;background:#16201c;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0}
#xcg .hd b{color:#5fd3a5}#xcg .bd{padding:6px 10px}#xcg h4{margin:8px 0 3px;color:#5fd3a5;font-size:13px}
#xcg label{display:block;margin:3px 0}#xcg input,#xcg textarea,#xcg select,#xcg button{background:#16201c;color:#d6ded9;border:1px solid #2c3d36;border-radius:4px;padding:2px 6px;font:inherit}
#xcg input[type=checkbox]{width:auto}#xcg textarea{width:100%;box-sizing:border-box}#xcg .add,#xcg .row{display:flex;gap:4px}#xcg .add input{flex:1}#xcg .row input{width:44px}
#xcg ul{list-style:none;padding:0;margin:3px 0;max-height:130px;overflow:auto}#xcg li{display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #1e2b26;padding:2px 0}
#xcg li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}#xcg li button{font-size:11px;margin-left:3px;cursor:pointer}#xcg .m{color:#789;font-size:11px}`;
  const HTML = `<div class="hd"><b>聊天卫士</b><span><span class="m" id="xcg-stats"></span> <button id="xcg-close">×</button></span></div><div class="bd">
<h4>屏蔽</h4><label><input type="checkbox" id="xcg-enabled"> 启用屏蔽（总开关）</label><label><input type="checkbox" id="xcg-blockEmotes"> 同时屏蔽其表情</label>
<ul id="xcg-blockList"></ul><div class="add"><input id="xcg-blockInput" placeholder="playerId 或 昵称"><button data-add="block">加入</button></div>
<h4>自动回复</h4><label><input type="checkbox" id="xcg-replyEnabled"> 启用自动回复</label><ul id="xcg-replyList"></ul>
<div class="add"><input id="xcg-replyInput" placeholder="playerId 或 昵称"><button data-add="reply">加入</button></div>
<label>文案（每行一条，超20字截断）<textarea id="xcg-replies" rows="3"></textarea></label>
<div class="row"><label>方式 <select id="xcg-replyMode"><option value="random">随机</option><option value="round">轮流</option></select></label><label>冷却秒 <input type="number" id="xcg-cooldownSec" min="3" max="600"></label><label>每分钟 <input type="number" id="xcg-perMinute" min="1" max="10"></label></div>
<h4>最近发言者 <button id="xcg-clear">清空</button></h4><ul id="xcg-speakers"></ul>
<div class="m">形如 ID（≥8位字母数字-_）按 playerId，否则按昵称匹配。设置自动保存。</div></div>`;
  function renderList(key) {
    const ul = $(key); if (!ul) return; ul.textContent = '';
    if (!S[key].length) ul.append(el('li', '（空）', 'm'));
    S[key].forEach((e, i) => { const li = el('li'); const b = el('button', '移除'); b.onclick = () => { S[key].splice(i, 1); save(); }; li.append(el('span', label(e)), b); ul.append(li); });
  }
  function renderStats() { const x = $('stats'); if (x) { const s = gGet('stats', {}); x.textContent = `屏蔽${s.blocked || 0} 回复${s.replied || 0}`; } }
  function renderSpeakers() {
    const ul = $('speakers'); if (!ul) return; ul.textContent = '';
    const list = gGet('speakers', []);
    if (!list.length) ul.append(el('li', '进入对局后有人发言会显示在这里', 'm'));
    for (const p of list) {
      const li = el('li'); const sp = el('span', `${p.name || '?'}：${p.text || ''}`); sp.title = p.playerId;
      const b1 = el('button', '屏蔽'); b1.onclick = () => addTo('blockList', { playerId: p.playerId, name: p.name });
      const b2 = el('button', '回复'); b2.onclick = () => addTo('replyList', { playerId: p.playerId, name: p.name });
      const d = el('div'); d.append(b1, b2); li.append(sp, d); ul.append(li);
    }
  }
  function render() {
    if (!root) return;
    for (const k of ['enabled', 'blockEmotes', 'replyEnabled']) $(k).checked = !!S[k];
    $('replyMode').value = S.replyMode; $('cooldownSec').value = S.cooldownSec; $('perMinute').value = S.perMinute;
    if (document.activeElement !== $('replies')) $('replies').value = S.replies.join('\n');
    renderList('blockList'); renderList('replyList'); renderSpeakers(); renderStats();
  }
  function build() {
    const st = el('style', CSS); document.head.append(st);
    root = el('div'); root.id = 'xcg'; root.innerHTML = HTML; document.body.append(root);
    const pos = gGet('panelPos', null); if (pos) { root.style.left = pos.x + 'px'; root.style.top = pos.y + 'px'; root.style.right = 'auto'; }
    // 阻止按键冒泡进游戏（游戏有全局快捷键）
    for (const ev of ['keydown', 'keyup', 'keypress', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());
    $('close').onclick = () => { root.style.display = 'none'; };
    for (const k of ['enabled', 'blockEmotes', 'replyEnabled']) $(k).onchange = () => { S[k] = $(k).checked; save(); };
    $('replyMode').onchange = () => { S.replyMode = $('replyMode').value; save(); };
    for (const k of ['cooldownSec', 'perMinute']) $(k).onchange = () => { const i = $(k); S[k] = Math.max(+i.min, Math.min(+i.max, Number(i.value) || DEFAULTS[k])); save(); };
    $('replies').oninput = () => { S.replies = $('replies').value.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => Array.from(s).slice(0, 20).join('')); gSet('settings', S); pushSettings(); };
    root.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { const inp = $(b.dataset.add + 'Input'); const v = inp.value.trim(); if (!v) return; addTo(b.dataset.add + 'List', looksId(v) ? { playerId: v, name: '' } : { name: v }); inp.value = ''; });
    $('clear').onclick = () => { gSet('speakers', []); renderSpeakers(); };
    const hd = root.querySelector('.hd'); let drag = null;
    hd.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; const r = root.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener('pointermove', (e) => { if (!drag) return; const x = Math.max(0, Math.min(innerWidth - 60, e.clientX - drag.dx)), y = Math.max(0, Math.min(innerHeight - 30, e.clientY - drag.dy)); Object.assign(root.style, { left: x + 'px', top: y + 'px', right: 'auto' }); });
    hd.addEventListener('pointerup', () => { if (drag) { drag = null; const r = root.getBoundingClientRect(); gSet('panelPos', { x: Math.round(r.left), y: Math.round(r.top) }); } });
    render();
  }
  function openPanel() { if (!document.body) return; if (!root) build(); root.style.display = ''; render(); }
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('打开聊天卫士设置', openPanel);
  // Alt+G 也可开关面板
  window.addEventListener('keydown', (e) => { if (e.altKey && (e.key === 'g' || e.key === 'G')) { if (root && root.style.display !== 'none') root.style.display = 'none'; else openPanel(); } }, true);
