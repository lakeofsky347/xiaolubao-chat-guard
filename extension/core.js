// 纯逻辑（无 DOM / chrome 依赖），MAIN world 与 node 单测共用。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.__XLB_GUARD_CORE__ = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_LEN = 20;
  const RID_BASE = 2100000000; // 客户端 rid 从 1 自增，%2147483000 回绕；此区间实际不可能被客户端用到
  const DEFAULTS = {
    enabled: true, blockEmotes: false,
    blockList: [],        // [{playerId?, name?}]
    replyEnabled: true,
    replyList: [],        // [{playerId?, name?}]
    replies: ['说得对，下次别说了', '你开心就好', '嗯嗯好的呢'],
    replyMode: 'random',  // random | round
    cooldownSec: 8, perMinute: 4,
  };

  const norm = (s) => (typeof s === 'string' ? s.trim() : '');
  function matchList(list, playerId, name) {
    if (!Array.isArray(list)) return false;
    const n = norm(name);
    return list.some((e) => e && ((e.playerId && e.playerId === playerId) || (!e.playerId && e.name && norm(e.name) === n)));
  }
  // 按 Unicode 字符截断（服务端按字计数，emoji 按码点）
  function truncate(text, max = MAX_LEN) {
    return Array.from(String(text || '')).slice(0, max).join('');
  }
  function shouldDrop(msg, settings) {
    const s = settings || DEFAULTS;
    if (!s.enabled || !msg || typeof msg !== 'object') return false;
    if (msg.t === 'm.chat') return matchList(s.blockList, msg.playerId, msg.name);
    if (msg.t === 'm.emote' && s.blockEmotes) return matchList(s.blockList, msg.playerId, msg.name);
    return false;
  }

  class ReplyEngine {
    constructor(opts = {}) {
      this.now = opts.now || (() => Date.now());
      this.random = opts.random || Math.random;
      this.settings = Object.assign({}, DEFAULTS);
      this.selfId = null; this.selfName = null;
      this.lastSentAt = -Infinity; this.sentTimes = [];
      this.backoffUntil = 0; this.backoffMs = 0;
      this.roundIdx = 0; this.ridSeq = 0;
      this.ourRids = new Set(); this.recentTexts = [];
    }
    setSettings(s) { this.settings = Object.assign({}, DEFAULTS, s || {}); }
    nextRid() { this.ridSeq = (this.ridSeq + 1) % 40000000; const r = RID_BASE + this.ridSeq; this.ourRids.add(r); if (this.ourRids.size > 200) this.ourRids.delete(this.ourRids.values().next().value); return r; }
    isOurRid(rid) { return this.ourRids.has(rid); }
    pickText() {
      const list = (this.settings.replies || []).map(norm).filter(Boolean);
      if (!list.length) return null;
      let t;
      if (this.settings.replyMode === 'round') { t = list[this.roundIdx % list.length]; this.roundIdx++; }
      else t = list[Math.floor(this.random() * list.length) % list.length];
      return truncate(t);
    }
    // 返回 null 或 {reason} 表示不回；返回 {frame} 表示要发送的帧
    onChat(msg) {
      const s = this.settings, now = this.now();
      if (!s.replyEnabled || !msg || msg.t !== 'm.chat') return { skip: 'off' };
      if (msg.playerId && this.selfId && msg.playerId === this.selfId) return { skip: 'self' };
      if (!this.selfId && this.selfName && norm(msg.name) === norm(this.selfName)) return { skip: 'self' };
      if (this.recentTexts.includes(msg.text) && msg.playerId === this.selfId) return { skip: 'self' };
      if (!matchList(s.replyList, msg.playerId, msg.name)) return { skip: 'notTarget' };
      if (now < this.backoffUntil) return { skip: 'backoff' };
      if (now - this.lastSentAt < (Number(s.cooldownSec) || 0) * 1000) return { skip: 'cooldown' };
      this.sentTimes = this.sentTimes.filter((t) => now - t < 60000);
      if (this.sentTimes.length >= (Number(s.perMinute) || 0)) return { skip: 'perMinute' };
      const text = this.pickText();
      if (!text) return { skip: 'noText' };
      this.lastSentAt = now; this.sentTimes.push(now);
      this.recentTexts = [...this.recentTexts.slice(-9), text];
      return { frame: { t: 'g.chat', text, rid: this.nextRid() } };
    }
    // 服务端对我们帧的回包；返回 true 表示该帧应对页面隐藏
    onReply(msg) {
      if (!msg || msg.rid == null || !this.isOurRid(msg.rid)) return false;
      this.ourRids.delete(msg.rid);
      if (msg.t === 'error') {
        if (msg.code === 'RATE') { this.backoffMs = Math.min(Math.max(this.backoffMs * 2, 15000), 300000); this.backoffUntil = this.now() + this.backoffMs; }
      } else this.backoffMs = 0;
      return true;
    }
  }
  return { DEFAULTS, MAX_LEN, RID_BASE, matchList, truncate, shouldDrop, ReplyEngine };
});
