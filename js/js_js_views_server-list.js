// community/public/js/views/server-list.js — 前台 · 服务器列表页.
// Mirrors the Ardot draft: nav (服务器 / 下载[hidden] / 关于), hero stats, region filters, node cards with the
// FULL healthz JSON panel, and a 「进入服务器」 jump button on each card.

import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import { api, ApiError } from '../api.js';
import { measureAll, grade } from '../latency.js';
import {
  html, BrandMark, IconShield, IconRefresh, IconCaret, IconArrow, JsonBlock,
  formatUptime, toast,
} from '../ui.js';

const POLL_MS = 15000;
/** 浏览器本地实测的节点数上限：只有服务端探测不出结果的节点才走本地兜底，且一次最多测这么多台。 */
const CLIENT_PROBE_MAX = 6;
const TABS = [{ id: 'servers', label: '服务器' }, { id: 'downloads', label: '下载', hidden: true }, { id: 'about', label: '关于' }];

/** Derive the headline numbers for the hero from the probed list. */
function summarize(servers) {
  let online = 0, humans = 0, matches = 0;
  const regions = new Set();
  const clusters = new Set();
  for (const s of servers) {
    if (!s.health?.ok) continue;
    regions.add(s.region);
    const raw = s.health.raw;
    const agg = raw?.cluster?.aggregate;
    if (agg && raw.cluster.id) {
      // 一个集群的每个节点都会报同一份「整簇」数字（/healthz 的 cluster.aggregate）：只按集群累加一次，
      // 否则两个节点会被加两遍。
      if (clusters.has(raw.cluster.id)) continue;
      clusters.add(raw.cluster.id);
      online += Number(agg.nodes) || 1;
      humans += Number(agg.humans) || 0;
      matches += Number(agg.matches) || 0;
    } else {
      online += 1;
      humans += Number(raw?.humans) || 0;
      matches += Number(raw?.matches) || 0;
    }
  }
  return { total: servers.length, online, humans, matches, regions: regions.size };
}

/** Round to a readable figure: sub-millisecond precision is noise, not signal. */
const fmtMs = (ms) => (ms == null ? null : `${Math.round(ms)} ms`);

/**
 * 状态药丸默认显示**服务端探测**的往返时间（community 服务器 → 节点，`server/probe.js` 有 10 s 缓存 + 按地址去重，
 * 所以访客再多也不会把游戏服打爆）。只有当服务端拿不到数字（`latencyMs` 缺失）时，才回退到**浏览器本地实测**的值。
 * `clientMs === undefined` = 还没测，`null` = 浏览器测不出来。
 */
const StatusView = ({ health, clientMs, measuring }) => {
  if (!health) return html`<div class="card__status is-off"><span class="card__status-main t-dim">探测中…</span></div>`;

  if (health.ok) {
    const serverMs = Number.isFinite(health.latencyMs) ? health.latencyMs : null;
    const ms = serverMs != null ? serverMs : clientMs;
    const fromServer = serverMs != null;
    const tone = grade(ms);
    return html`<div class="card__status">
      <span class="card__status-main t-mint">运行正常</span>
      ${ms == null
        ? html`<span class="card__status-sub">${measuring ? '测速中…' : '延迟未知'}</span>`
        : html`<span class=${`card__status-sub t-${tone === 'good' ? 'mint' : tone === 'fair' ? 'gold' : 'red'}`}
                       title=${fromServer ? '社区服务器探测到该节点的往返时间（服务端缓存，不消耗玩家带宽）' : '服务端无探测数据，此为由你的浏览器实测'}>${fromServer ? '节点' : '本机'} ${fmtMs(ms)}</span>`}
    </div>`;
  }

  const stale = /版本|更新/.test(health.error || '');
  return html`<div class=${`card__status ${stale ? 'is-warn' : 'is-off'}`}>
    <span class=${`card__status-main ${stale ? 't-amber' : 't-red'}`}>${stale ? '版本待更新' : '离线无响应'}</span>
    <span class="card__status-sub">${stale ? health.error : '不可达'}</span>
  </div>`;
};

const ServerCard = ({ server, clientMs, measuring }) => {
  const [open, setOpen] = useState(false);
  const h = server.health;
  const raw = h?.raw;
  const online = !!h?.ok;
  const metrics = raw ? [
    ['HUMANS 在线玩家', raw.humans, 'is-mint'], ['ROOMS 房间', raw.rooms], ['MATCHES 对局', raw.matches],
    ['SOCKETS 连接', raw.sockets], ['SESSIONS 会话', raw.sessions],
    ['UPTIME 运行时长', formatUptime(raw.uptimeSec), 'is-gold'], ['RSS 内存', `${raw.mem?.rss ?? '–'}MB`, 'is-ice'],
  ] : [];

  return html`
    <article class=${`card ${online ? 'is-online' : 'is-offline'}`}>
      <div class="card__main">
        <div class="card__top">
          <div class="card__id">
            <span class=${`card__dot ${online ? 'is-online' : 'is-offline'}`}></span>
            <div class="card__names">
              <div class="card__name-row">
                <span class="card__name">${server.name}</span>
                <span class=${`tag tag--${server.region}`}>${server.regionLabel}</span>
              </div>
              <div class="card__addr">${server.address.replace(/\/+$/, '')}</div>
            </div>
          </div>

          <div class="card__side">
            ${raw ? html`<div class="card__ver">
              <span class="card__ver-k">APP 版本</span>
              <span class=${`card__ver-v ${online ? '' : 'is-off'}`}>v${raw.app || raw.version || '?'}</span>
            </div>` : null}
            <${StatusView} health=${h} clientMs=${clientMs} measuring=${measuring} />
            <div class="card__actions">
              ${online
                ? html`<a class="btn btn--primary btn--sm" href=${server.address} target="_blank" rel="noopener noreferrer">
                    <span class="btn__icon"><${IconArrow} size=${14} /></span>进入服务器
                  </a>`
                : html`<button class="btn btn--sm" disabled>不可用</button>`}
            </div>
          </div>
        </div>

        ${metrics.length ? html`<div class="card__metrics">
          ${metrics.map(([k, v, tone]) => html`<div class="metric" key=${k}><span class=${`metric__v ${tone || ''}`}>${v ?? '–'}</span><span class="metric__k">${k}</span></div>`)}
        </div>` : null}
      </div>

      ${raw ? html`<div class="card__expand">
        <div class=${`card__expand-head`} onClick=${() => setOpen((o) => !o)} role="button" tabindex="0"
             onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}>
          <span class="card__expand-title">HEALTHZ · 原始数据（全量）</span>
          <span class="toolbar__meta">${Object.keys(raw).length} 个字段</span>
          <span class=${`card__expand-caret ${open ? 'is-open' : ''}`}><${IconCaret} size=${18} /></span>
        </div>
        ${open ? html`<div class="json"><${JsonBlock} value=${raw} /></div>` : null}
      </div>` : null}
    </article>`;
};

export function ServerList({ ctx, onNavigate, onSession }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState('all');
  const [tab, setTab] = useState('servers');
  const [latency, setLatency] = useState({});
  const [measuring, setMeasuring] = useState(false);
  const timer = useRef(null);
  const latencyTimer = useRef(null);
  const serversRef = useRef([]);

  const load = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true);
    try {
      const { servers: list } = await api.listServers({ probe: true });
      serversRef.current = list;
      setServers(list);
    } catch (e) {
      if (initial) toast.err(e.message || '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /**
   * 浏览器本地实测（public/js/latency.js）。**默认只测「服务端没有探测结果」的节点**，而且设了上限：
   * 每个访客对每台节点打 3 次请求，节点一多、人一多就是高并发打爆游戏服 —— 这正是要避免的事。
   * `onlyMissing=false` 只在用户主动点「本机测速」时用。
   */
  const measureLatencies = useCallback(async (onlyMissing = true) => {
    const targets = serversRef.current
      .filter((s) => s.health?.ok)
      .filter((s) => !onlyMissing || !Number.isFinite(s.health?.latencyMs))
      .slice(0, CLIENT_PROBE_MAX);
    if (!targets.length) return;
    setMeasuring(true);
    try {
      const result = await measureAll(targets);
      setLatency((prev) => ({ ...prev, ...result }));
    } finally {
      setMeasuring(false);
    }
  }, []);

  useEffect(() => {
    // 首次和每次轮询：只用服务端探测结果，只对「服务端没数据」的节点做本地兜底实测。
    load(true).then(() => measureLatencies(true));
    timer.current = setInterval(() => load(false).then(() => measureLatencies(true)), POLL_MS);
    return () => { clearInterval(timer.current); };
  }, [load, measureLatencies]);

  const regions = ctx.regions || [];
  const filtered = useMemo(
    () => (region === 'all' ? servers : servers.filter((s) => s.region === region)),
    [servers, region],
  );
  const stats = useMemo(() => summarize(servers), [servers]);

  const reload = useCallback(async () => {
    await load(false);
    await measureLatencies(true);
  }, [load, measureLatencies]);

  /** 用户主动要自己的延迟时才全量实测（一次点击 = 一次代价，不是每个访客的后台流量）。 */
  const measureAllNow = useCallback(async () => {
    setLatency({});
    await measureLatencies(false);
    toast.ok('已用本机实测延迟');
  }, [measureLatencies]);

  const doLogout = async () => { await api.logout(); await onSession(); toast.ok('已退出登录'); };

  return html`
    <div class="page">
      <header class="nav">
        <div class="nav__wrap nav__in">
          <div class="nav__left">
            <a class="brand" href="/" onClick=${(e) => { e.preventDefault(); onNavigate('/'); }}>
              <${BrandMark} size=${34} />
              <span class="brand__txt">
                <span class="brand__name">STRONGHOLD PROTOCOL</span>
                <span class="brand__sub">${ctx.site?.name || '卫戍协议'} · 社区</span>
              </span>
            </a>
          </div>

          ${/* The tab strip is a direct child of .nav__in so its absolute centring is measured
                against the bar itself, not against .nav__left. */ ''}
          <nav class="tabs">
            ${TABS.filter((t) => !t.hidden).map((t) => html`
              <button key=${t.id} class=${`tab ${tab === t.id ? 'is-active' : ''}`} onClick=${() => setTab(t.id)}>${t.label}</button>`)}
          </nav>

          <div class="nav__right">
            ${ctx.account
              ? html`<span class="chip"><span class="chip__dot is-on"></span>${ctx.account.displayName}</span>`
              : html`<span class="chip"><span class="chip__dot"></span>游客浏览中</span>`}
            ${ctx.isAdmin
              ? html`<button class="btn btn--sm" onClick=${() => onNavigate('/admin')}>管理控制台</button>
                     <button class="btn btn--ghost btn--sm" onClick=${doLogout}>退出</button>`
              : html`<button class="btn btn--entry btn--sm" onClick=${() => onNavigate('/admin')}>
                       <span class="btn__icon"><${IconShield} size=${14} /></span>管理入口
                     </button>`}
          </div>
        </div>
      </header>

      <main class="wrap">
        ${tab === 'about' ? html`
          <section class="hero">
            <div class="hero__label">SERVER DIRECTORY</div>
            <div class="hero__title">关于本站</div>
            <p class="hero__desc">
              这是《卫戍协议》的社区服务器聚合站，用于汇总公开的联机节点。列表页实时探测各节点的
              <code style="color:var(--mint-500)">/healthz</code> 状态，并完整展示其原始数据。
              本站关闭自助注册，账号仅能由管理员在后台创建。
            </p>
          </section>` : html`
          <section class="hero">
            <div class="hero__head">
              <div>
                <div class="hero__label">SERVER NETWORK · 实时节点监控</div>
                <h1 class="hero__title">公益服务器列表</h1>
                <p class="hero__desc">下拉自动刷新各节点 /healthz 实时状态 · 数据每 ${POLL_MS / 1000} 秒同步一次</p>
              </div>
              <div class="stats">
                <div class="stat stat--mint"><span class="stat__val">${stats.online}</span><span class="stat__label">在线节点</span></div>
                <div class="stat stat--mint"><span class="stat__val">${stats.humans.toLocaleString()}</span><span class="stat__label">在线玩家</span></div>
                <div class="stat stat--gold"><span class="stat__val">${stats.matches.toLocaleString()}</span><span class="stat__label">进行中对局</span></div>
                <div class="stat stat--ice"><span class="stat__val">${stats.regions}</span><span class="stat__label">可用大区</span></div>
              </div>
            </div>
            <div class="rule"></div>
          </section>
        `}
        ${tab === 'about' ? null : html`
          <div class="toolbar">
            <div class="filters">
              <button class=${`filter ${region === 'all' ? 'is-active' : ''}`} onClick=${() => setRegion('all')}>全部区域</button>
              ${regions.map((r) => html`<button key=${r.value} class=${`filter ${region === r.value ? 'is-active' : ''}`} onClick=${() => setRegion(r.value)}>${r.label}</button>`)}
            </div>
            <div class="toolbar__spacer"></div>
            <button class="btn btn--chip" onClick=${measureAllNow} disabled=${measuring}>
              <span class="btn__icon"><${IconRefresh} size=${13} /></span>${measuring ? '测速中…' : '本机测速'}
            </button>
            <button class="btn btn--chip" onClick=${reload} disabled=${refreshing}>
              <span class="btn__icon"><${IconRefresh} size=${13} /></span>${refreshing ? '刷新中…' : '刷新'}
            </button>
          </div>

          ${loading
            ? html`<div class="state"><div class="state__hex"></div><div class="state__big">正在探测服务器状态…</div></div>`
            : filtered.length === 0
              ? html`<div class="state"><div class="state__big">该区域暂无服务器</div><p>换一个区域试试，或等待管理员添加。</p></div>`
              : html`<div class="cards">${filtered.map((s) => html`<${ServerCard} key=${s.id} server=${s} clientMs=${latency[String(s.id)]} measuring=${measuring} />`)}</div>`}
        `}
      </main>

      <footer class="foot">
        <div class="wrap foot__in">
          <span>《卫戍协议》非官方同人项目 · 社区聚合站</span>
          <span>账号仅限管理员创建 · 本站不提供自助注册</span>
        </div>
      </footer>
    </div>`;
}
