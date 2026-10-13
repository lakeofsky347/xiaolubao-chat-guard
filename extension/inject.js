// MAIN world：包装 window.WebSocket，只处理路径为 /ws 的连接。
(function () {
  'use strict';
  const core = window.__XLB_GUARD_CORE__;
  if (!core || window.__XLB_GUARD_INSTALLED__) return;
  window.__XLB_GUARD_INSTALLED__ = true;
  const TAG = 'xlb-chat-guard';
  const engine = new core.ReplyEngine();
  let settings = Object.assign({}, core.DEFAULTS);
  const post = (type, data) => window.postMessage({ src: TAG, dir: 'toBridge', type, data }, location.origin);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.src !== TAG || d.dir !== 'toPage') return;
    if (d.type === 'settings') { settings = Object.assign({}, core.DEFAULTS, d.data || {}); engine.setSettings(settings); }
  });

  const Native = window.WebSocket;
  const isGameWs = (url) => { try { return new URL(String(url), location.href).pathname === '/ws'; } catch { return false; } };

  function Guarded(url, protocols) {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    if (!isGameWs(url)) return ws;
    const nativeSend = ws.send.bind(ws);
    ws.send = function (data) {
      try { const m = JSON.parse(data); if (m && m.t === 'hello' && typeof m.name === 'string') engine.selfName = m.name; } catch {}
      return nativeSend(data);
    };
    // 构造时最先注册，先于页面的任何 message 监听器执行
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'welcome') { const id = m.playerId || (m.player && m.player.id) || m.id; if (typeof id === 'string') engine.selfId = id; if (typeof m.name === 'string') engine.selfName = m.name; }
      if (engine.onReply(m)) { ev.stopImmediatePropagation(); return; }
      if (m.t === 'm.chat' && typeof m.playerId === 'string' && m.playerId !== engine.selfId) post('speaker', { playerId: m.playerId, name: typeof m.name === 'string' ? m.name : '', text: String(m.text || '').slice(0, 40), at: Date.now() });
      if (m.t === 'm.chat') {
        const r = engine.onChat(m);
        if (r.frame && ws.readyState === 1) setTimeout(() => { try { nativeSend(JSON.stringify(r.frame)); post('replied', { to: m.name, text: r.frame.text }); } catch {} }, 600 + Math.random() * 900);
      }
      if (core.shouldDrop(m, settings)) { ev.stopImmediatePropagation(); post('blocked', { t: m.t }); }
    });
    return ws;
  }
  Guarded.prototype = Native.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Object.defineProperty(Guarded, k, { value: Native[k] });
  Object.setPrototypeOf(Guarded, Native);
  window.WebSocket = Guarded;
  post('ready');
})();
