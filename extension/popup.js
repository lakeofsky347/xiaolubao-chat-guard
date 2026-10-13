const DEFAULTS = { enabled: true, blockEmotes: false, blockList: [], replyEnabled: true, replyList: [], replies: ['说得对，下次别说了', '你开心就好', '嗯嗯好的呢'], replyMode: 'random', cooldownSec: 8, perMinute: 4 };
let S = { ...DEFAULTS };
const $ = (id) => document.getElementById(id);
const save = () => chrome.storage.sync.set({ settings: S });
const looksId = (v) => /^[A-Za-z0-9_-]{8,}$/.test(v);
const label = (e) => e.playerId ? `${e.name || '?'}（${e.playerId}）` : `昵称：${e.name}`;
const same = (a, b) => a.playerId ? a.playerId === b.playerId : (!b.playerId && a.name === b.name);
function addTo(key, entry) { if (!S[key].some((e) => same(e, entry))) { S[key] = [...S[key], entry]; save(); render(); } }
function renderList(key) {
  const ul = $(key); ul.innerHTML = '';
  if (!S[key].length) ul.innerHTML = '<li class="muted">（空）</li>';
  S[key].forEach((e, i) => {
    const li = document.createElement('li'); const sp = document.createElement('span'); sp.textContent = label(e);
    const b = document.createElement('button'); b.textContent = '移除'; b.onclick = () => { S[key].splice(i, 1); save(); render(); };
    li.append(sp, b); ul.append(li);
  });
}
function render() {
  for (const k of ['enabled', 'blockEmotes', 'replyEnabled']) $(k).checked = !!S[k];
  $('replyMode').value = S.replyMode; $('cooldownSec').value = S.cooldownSec; $('perMinute').value = S.perMinute;
  if (document.activeElement !== $('replies')) $('replies').value = S.replies.join('\n');
  renderList('blockList'); renderList('replyList');
}
function renderSpeakers(list) {
  const ul = $('speakers'); ul.innerHTML = '';
  if (!list.length) ul.innerHTML = '<li class="muted">进入对局后有人发言会显示在这里</li>';
  for (const p of list) {
    const li = document.createElement('li'); const sp = document.createElement('span');
    sp.textContent = `${p.name || '?'}：${p.text || ''}`; sp.title = p.playerId;
    const b1 = document.createElement('button'); b1.textContent = '屏蔽'; b1.onclick = () => addTo('blockList', { playerId: p.playerId, name: p.name });
    const b2 = document.createElement('button'); b2.textContent = '回复'; b2.onclick = () => addTo('replyList', { playerId: p.playerId, name: p.name });
    const d = document.createElement('div'); d.append(b1, b2); li.append(sp, d); ul.append(li);
  }
}
for (const k of ['enabled', 'blockEmotes', 'replyEnabled']) $(k).onchange = () => { S[k] = $(k).checked; save(); };
$('replyMode').onchange = () => { S.replyMode = $('replyMode').value; save(); };
for (const k of ['cooldownSec', 'perMinute']) $(k).onchange = () => { const v = Math.max(+$(k).min, Math.min(+$(k).max, Number($(k).value) || DEFAULTS[k])); S[k] = v; $(k).value = v; save(); };
$('replies').oninput = () => { S.replies = $('replies').value.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => Array.from(s).slice(0, 20).join('')); save(); };
document.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
  const inp = $(b.dataset.add + 'Input'); const v = inp.value.trim(); if (!v) return;
  addTo(b.dataset.add + 'List', looksId(v) ? { playerId: v, name: '' } : { name: v }); inp.value = '';
});
$('clearSpeakers').onclick = () => chrome.storage.local.set({ speakers: [] });
chrome.storage.sync.get('settings', (r) => { S = { ...DEFAULTS, ...(r.settings || {}) }; render(); });
const loadLocal = () => chrome.storage.local.get(['speakers', 'stats'], (r) => { renderSpeakers(r.speakers || []); const s = r.stats || {}; $('stats').textContent = `已屏蔽 ${s.blocked || 0} · 已回复 ${s.replied || 0}`; });
loadLocal(); chrome.storage.onChanged.addListener(loadLocal);
