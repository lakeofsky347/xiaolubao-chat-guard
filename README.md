# 卫戍协议 聊天卫士（油猴脚本）

为《卫戍协议：盟约》网页版各节点（`*.xiaolubao.com`，如 hk.xiaolubao.com）的**局内聊天**提供：
- **屏蔽**：按 playerId 或昵称屏蔽某人的聊天（可选同时屏蔽表情），消息在到达游戏界面前即被丢弃。
- **自动回复**：对指定的人自动回复，文案自定义（随机/轮流），自动截断到 20 字，带冷却（默认 8 秒）、每分钟上限、限流（RATE）自动退避，不回复自己。

## 一键安装
1. 先安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 点击安装：**[xiaolubao-chat-guard.user.js](https://raw.githubusercontent.com/lakeofsky347/xiaolubao-chat-guard/main/xiaolubao-chat-guard.user.js)**
3. 刷新游戏页面。Chrome/Edge 新版 Tampermonkey 可能需要在扩展详情中开启「允许用户脚本」/开发者模式。

脚本已配置 `@updateURL`，更新会自动推送。

## 使用
- 打开设置面板：点 Tampermonkey 图标 →「打开聊天卫士设置」，或在游戏页按 **Alt+G**。面板可拖动标题栏移动，位置会记住。
- 「最近发言者」：进入对局后别人发言会列出，点「屏蔽」/「回复」一键加入名单（按 playerId，最准确）。
- 手动输入：形如 ID（≥8 位字母/数字/-/_）按 playerId 匹配，否则按昵称精确匹配（昵称可被冒用，推荐 playerId）。
- 设置用 GM_setValue 保存，所有节点域名通用。

## 原理
游戏通过 `wss://<节点>/ws` 收发 JSON：收到 `m.chat {playerId,name,text}` / `m.emote`，发送 `g.chat {text}`。
脚本在 document-start 以 `<script>` 注入页面上下文（失败时退回 `unsafeWindow`）包装 `window.WebSocket`，只处理 `/ws`：
命中黑名单的消息阻止页面接收；命中回复名单时延迟 0.6–1.5 秒发送 `g.chat`，rid 使用 2100000000 以上私有区间以避免与客户端冲突，其回包被脚本吞掉。

## 目录
- `xiaolubao-chat-guard.user.js` 油猴脚本（由 `node userscript/build.js` 生成）
- `extension/` 同功能的 Chrome/Edge MV3 扩展（开发者模式「加载已解压的扩展程序」）
- `userscript/` 构建脚本与面板代码；`test/run.js` 单测（`node test/run.js`，纯本地模拟，不联网）

## ⚠️ 风险提示
- 本脚本修改游戏客户端网络行为，**自动发言可能违反游戏/社区规则，导致禁言或封号**，后果自负。
- 请勿用于辱骂、骚扰他人；建议文案友善并保留冷却与频率上限。
- 屏蔽只作用于你自己的界面；游戏更新协议后脚本可能失效。
- 非官方工具，与游戏作者无关。不收集、不上传任何数据。
