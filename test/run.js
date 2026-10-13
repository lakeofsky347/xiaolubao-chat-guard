const assert = require('assert'); const fs = require('fs'); const vm = require('vm'); const path = require('path');
const EXT = path.join(__dirname, '../extension');
const core = require(EXT + '/core.js');
let pass = 0; const t = (n, f) => { f(); pass++; console.log('✓', n); };
// ---- core ----
const S = (o) => Object.assign({}, core.DEFAULTS, o);
t('按 playerId 屏蔽', () => assert(core.shouldDrop({ t: 'm.chat', playerId: 'p1', name: 'A', text: 'x' }, S({ blockList: [{ playerId: 'p1' }] }))));
t('按昵称屏蔽（去空格）', () => assert(core.shouldDrop({ t: 'm.chat', playerId: 'p9', name: ' 坏人 ', text: 'x' }, S({ blockList: [{ name: '坏人' }] }))));
t('有 playerId 的条目不按昵称误伤', () => assert(!core.shouldDrop({ t: 'm.chat', playerId: 'p2', name: 'A' }, S({ blockList: [{ playerId: 'p1', name: 'A' }] }))));
t('总开关关闭不屏蔽', () => assert(!core.shouldDrop({ t: 'm.chat', playerId: 'p1' }, S({ enabled: false, blockList: [{ playerId: 'p1' }] }))));
t('表情默认不屏蔽，开启后屏蔽', () => { const m = { t: 'm.emote', playerId: 'p1', id: 3 }; assert(!core.shouldDrop(m, S({ blockList: [{ playerId: 'p1' }] }))); assert(core.shouldDrop(m, S({ blockEmotes: true, blockList: [{ playerId: 'p1' }] }))); });
t('其他消息不受影响', () => assert(!core.shouldDrop({ t: 'm.public', playerId: 'p1' }, S({ blockList: [{ playerId: 'p1' }] }))));
t('截断20字（按码点）', () => { assert.strictEqual(Array.from(core.truncate('一'.repeat(30))).length, 20); assert.strictEqual(core.truncate('😀'.repeat(25)), '😀'.repeat(20)); });
function mk(o) { let now = 1e6; const e = new core.ReplyEngine({ now: () => now, random: () => 0 }); e.setSettings(S(Object.assign({ replyList: [{ playerId: 'bad' }] }, o))); e.selfId = 'me'; return { e, adv: (ms) => (now += ms) }; }
const chat = (pid, name = 'X', text = 'hi') => ({ t: 'm.chat', playerId: pid, name, text });
t('对目标回复，帧格式正确', () => { const { e } = mk(); const r = e.onChat(chat('bad')); assert.strictEqual(r.frame.t, 'g.chat'); assert(r.frame.rid >= core.RID_BASE); assert(Array.from(r.frame.text).length <= 20); });
t('非目标/自己不回', () => { const { e } = mk({ replyList: [{ playerId: 'bad' }, { playerId: 'me' }] }); assert.strictEqual(e.onChat(chat('x')).skip, 'notTarget'); assert.strictEqual(e.onChat(chat('me')).skip, 'self'); });
t('未知 selfId 时按昵称识别自己', () => { const { e } = mk({ replyList: [{ name: '我' }] }); e.selfId = null; e.selfName = '我'; assert.strictEqual(e.onChat(chat('zz', '我')).skip, 'self'); });
t('冷却8秒', () => { const { e, adv } = mk(); assert(e.onChat(chat('bad')).frame); adv(7000); assert.strictEqual(e.onChat(chat('bad')).skip, 'cooldown'); adv(1500); assert(e.onChat(chat('bad')).frame); });
t('每分钟上限', () => { const { e, adv } = mk({ cooldownSec: 0, perMinute: 3 }); for (let i = 0; i < 3; i++) { assert(e.onChat(chat('bad')).frame); adv(1000); } assert.strictEqual(e.onChat(chat('bad')).skip, 'perMinute'); adv(60000); assert(e.onChat(chat('bad')).frame); });
t('轮流模式', () => { const { e, adv } = mk({ cooldownSec: 0, perMinute: 10, replyMode: 'round', replies: ['a', 'b'] }); const got = []; for (let i = 0; i < 3; i++) { got.push(e.onChat(chat('bad')).frame.text); adv(10); } assert.deepStrictEqual(got, ['a', 'b', 'a']); });
t('RATE 退避并指数增长，成功后复位', () => { const { e, adv } = mk({ cooldownSec: 0, perMinute: 10 }); let r = e.onChat(chat('bad')); assert(e.onReply({ t: 'error', code: 'RATE', rid: r.frame.rid })); assert.strictEqual(e.onChat(chat('bad')).skip, 'backoff'); adv(15001); r = e.onChat(chat('bad')); e.onReply({ t: 'error', code: 'RATE', rid: r.frame.rid }); assert.strictEqual(e.backoffMs, 30000); adv(30001); r = e.onChat(chat('bad')); e.onReply({ t: 'ok', rid: r.frame.rid }); assert.strictEqual(e.backoffMs, 0); });
t('客户端 rid 的回包不被吞', () => { const { e } = mk(); assert(!e.onReply({ t: 'ok', rid: 5 })); });
t('回复开关关闭', () => { const { e } = mk({ replyEnabled: false }); assert.strictEqual(e.onChat(chat('bad')).skip, 'off'); });
// ---- inject.js 集成：模拟浏览器 window + WebSocket ----
class MockWS extends EventTarget { constructor(url) { super(); this.url = url; this.readyState = 1; this.sent = []; MockWS.last = this; } send(d) { this.sent.push(JSON.parse(d)); }
  set onmessage(f) { this.addEventListener('message', f); } push(o) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(o) })); } }
['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => (MockWS[k] = i));
const win = new EventTarget(); const posted = [];
Object.assign(win, { WebSocket: MockWS, location: { href: 'https://hk.xiaolubao.com/', origin: 'https://hk.xiaolubao.com' },
  postMessage: (d) => { posted.push(d); if (d.dir === 'toPage') win.dispatchEvent(Object.assign(new Event('message'), { data: d, source: win })); } });
const ctx = vm.createContext({ window: win, self: win, location: win.location, URL, JSON, Date, Math, setTimeout: (f) => f(), console, Array, Object, Set, String, Number });
vm.runInContext(fs.readFileSync(EXT + '/core.js', 'utf8'), ctx); vm.runInContext(fs.readFileSync(EXT + '/inject.js', 'utf8'), ctx);
win.postMessage({ src: 'xlb-chat-guard', dir: 'toPage', type: 'settings', data: { blockList: [{ playerId: 'troll' }], blockEmotes: true, replyList: [{ playerId: 'troll' }], cooldownSec: 0 } });
t('非 /ws 连接不包装', () => { const w = new win.WebSocket('wss://hk.xiaolubao.com/other'); assert(w instanceof MockWS); });
const ws = new win.WebSocket('wss://hk.xiaolubao.com/ws'); const seen = []; ws.onmessage = (ev) => seen.push(JSON.parse(ev.data));
ws.send(JSON.stringify({ t: 'hello', name: '我', rid: 1 }));
ws.push({ t: 'welcome', playerId: 'me', rid: 1 });
t('instanceof 保持', () => assert(ws instanceof win.WebSocket && win.WebSocket.OPEN === 1));
ws.push({ t: 'm.chat', playerId: 'troll', name: '喷子', text: '菜' });
ws.push({ t: 'm.emote', playerId: 'troll', id: 2 });
ws.push({ t: 'm.chat', playerId: 'friend', name: '好友', text: 'gg' });
t('页面收不到被屏蔽的 chat/emote，正常消息透传', () => { assert.deepStrictEqual(seen.map((m) => m.t + ':' + (m.playerId || '')), ['welcome:me', 'm.chat:friend']); });
const reply = ws.sent.find((m) => m.t === 'g.chat');
t('对喷子自动回复且 rid 在私有区间', () => { assert(reply && reply.rid >= 2100000000); });
ws.push({ t: 'error', code: 'RATE', rid: reply.rid });
t('我们帧的错误回包对页面隐藏', () => assert(!seen.some((m) => m.t === 'error')));
ws.push({ t: 'm.chat', playerId: 'me', name: '我', text: reply.text });
t('不回复自己 / 记录发言者', () => { assert.strictEqual(ws.sent.filter((m) => m.t === 'g.chat').length, 1); assert(posted.some((p) => p.type === 'speaker' && p.data.playerId === 'troll')); assert(!posted.some((p) => p.type === 'speaker' && p.data.playerId === 'me')); });
console.log(`\n全部通过：${pass} 项`);

// ---- 油猴脚本集成：模拟 Tampermonkey（GM_* + document.createElement('script') 在页面 realm 执行） ----
{
  class WS2 extends EventTarget { constructor(url) { super(); this.url = url; this.readyState = 1; this.sent = []; WS2.last = this; } send(d) { this.sent.push(JSON.parse(d)); } set onmessage(f) { this.addEventListener('message', f); } push(o) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(o) })); } }
  const store = { settings: { blockList: [{ name: '喷子' }], replyList: [{ playerId: 'troll' }], cooldownSec: 0 } }; let menu = null;
  const w = new EventTarget(); const loc = { href: 'https://hk.xiaolubao.com/', origin: 'https://hk.xiaolubao.com' };
  w.location = loc; w.WebSocket = WS2;
  w.postMessage = (d) => w.dispatchEvent(Object.assign(new Event('message'), { data: d, source: w }));
  const pageCtx = vm.createContext({ window: w, globalThis: undefined, URL, JSON, Date, Math, console, setTimeout: (f) => f() });
  pageCtx.globalThis = pageCtx; pageCtx.self = w; pageCtx.location = loc;
  let injected = 0;
  const documentMock = { documentElement: { appendChild: (s) => { injected++; vm.runInContext(s.textContent, pageCtx); } }, head: null, body: null, createElement: () => ({ remove() {} }) };
  const sandbox = vm.createContext({ window: w, unsafeWindow: w, document: documentMock, console, JSON, Math, Array, Object,
    GM_getValue: (k) => store[k], GM_setValue: (k, v) => (store[k] = v), GM_registerMenuCommand: (n, f) => (menu = n), GM_addValueChangeListener: () => {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../xiaolubao-chat-guard.user.js'), 'utf8'), sandbox);
  t('[油猴] 通过 <script> 注入到页面上下文且只注入一次', () => { assert.strictEqual(injected, 1); assert(w.__XLB_GUARD_INSTALLED__); assert(w.WebSocket !== WS2); });
  t('[油猴] 注册菜单命令', () => assert.strictEqual(menu, '打开聊天卫士设置'));
  const ws = new w.WebSocket('wss://hk.xiaolubao.com/ws'); const got = []; ws.onmessage = (e) => got.push(JSON.parse(e.data));
  ws.push({ t: 'welcome', playerId: 'me' });
  ws.push({ t: 'm.chat', playerId: 'troll', name: '喷子', text: '菜' });
  ws.push({ t: 'm.chat', playerId: 'f', name: '好友', text: 'gg' });
  t('[油猴] GM 存储的设置生效：按昵称屏蔽', () => assert.deepStrictEqual(got.filter((m) => m.t === 'm.chat').map((m) => m.playerId), ['f']));
  t('[油猴] 自动回复发出', () => assert(ws.sent.some((m) => m.t === 'g.chat' && m.rid >= 2100000000)));
  t('[油猴] 发言者与统计写入 GM 存储', () => { assert(store.speakers.some((s) => s.playerId === 'troll')); assert.strictEqual(store.stats.blocked, 1); assert.strictEqual(store.stats.replied, 1); });
  console.log(`油猴部分完成，总计通过：${pass} 项`);
}
