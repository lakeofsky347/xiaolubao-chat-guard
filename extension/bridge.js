// ISOLATED world：chrome.storage <-> 页面脚本。
(function () {
  const TAG = 'xlb-chat-guard';
  const send = (s) => window.postMessage({ src: TAG, dir: 'toPage', type: 'settings', data: s }, location.origin);
  const load = () => chrome.storage.sync.get('settings', (r) => send(r.settings || {}));
  load();
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.settings) send(c.settings.newValue || {}); });
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.src !== TAG || d.dir !== 'toBridge') return;
    if (d.type === 'ready') load();
    else if (d.type === 'speaker') {
      chrome.storage.local.get('speakers', (r) => {
        const list = (r.speakers || []).filter((x) => x.playerId !== d.data.playerId);
        list.unshift(d.data);
        chrome.storage.local.set({ speakers: list.slice(0, 30) });
      });
    } else if (d.type === 'blocked' || d.type === 'replied') {
      chrome.storage.local.get('stats', (r) => {
        const s = r.stats || { blocked: 0, replied: 0 };
        s[d.type] = (s[d.type] || 0) + 1;
        chrome.storage.local.set({ stats: s });
      });
    }
  });
})();
