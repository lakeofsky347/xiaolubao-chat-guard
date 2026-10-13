// 生成 xiaolubao-chat-guard.user.js：复用 extension/core.js + inject.js
const fs = require('fs'), p = require('path'), R = (f) => fs.readFileSync(p.join(__dirname, '..', f), 'utf8');
const V = require(p.join(__dirname, '..', 'extension/manifest.json')).version;
const RAW = 'https://raw.githubusercontent.com/lakeofsky347/xiaolubao-chat-guard/main/xiaolubao-chat-guard.user.js';
const header = `// ==UserScript==
// @name         卫戍协议 聊天卫士
// @namespace    https://github.com/lakeofsky347/xiaolubao-chat-guard
// @version      ${V}
// @description  卫戍协议（*.xiaolubao.com）局内聊天：按人屏蔽、按人自动回复。
// @author       lakeofsky347
// @match        *://*.xiaolubao.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @homepageURL  https://github.com/lakeofsky347/xiaolubao-chat-guard
// @updateURL    ${RAW}
// @downloadURL  ${RAW}
// ==/UserScript==
// 本文件由 userscript/build.js 生成，请修改 extension/core.js、extension/inject.js 或 userscript/ui.js 后重新构建。
`;
const out = `${header}
(function () {
  'use strict';
  // ===== PAGE_MAIN 在页面上下文运行：core.js + inject.js =====
  function PAGE_MAIN(w) {
    var window = w || globalThis.window, self = window, location = window.location;
${R('extension/core.js')}
${R('extension/inject.js')}
  }
${R('userscript/ui.js')}
})();
`;
fs.writeFileSync(p.join(__dirname, '..', 'xiaolubao-chat-guard.user.js'), out);
console.log('built', out.length, 'bytes');
