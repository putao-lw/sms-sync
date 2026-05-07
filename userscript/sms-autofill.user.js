// ==UserScript==
// @name         SMS验证码自动填写
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动点击、输入手机号、等待验证码并自动填写
// @author       sms-sync
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ========== 配置 ==========
  const CONFIG = {
    PHONE: '13607540625',
    SERVER_URL: 'http://localhost:3456',
    POLL_INTERVAL: 2000,       // 轮询间隔 ms
    POLL_TIMEOUT: 60000,       // 轮询超时 ms
    CLICK_DELAY: 1000,         // 点击后等待 ms
    INPUT_DELAY: 300,          // 输入字符间隔 ms
  };

  // ========== 状态 ==========
  let state = {
    running: false,
    polling: false,
    pollTimer: null,
    pollStart: 0,
    serverConnected: false,
  };

  // ========== UI ==========
  GM_addStyle(`
    #sms-sync-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #fff;
      border: 2px solid #4CAF50;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      min-width: 220px;
      user-select: none;
    }
    #sms-sync-panel .title {
      font-weight: bold;
      font-size: 15px;
      margin-bottom: 10px;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #sms-sync-panel .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.online { background: #4CAF50; }
    .status-dot.offline { background: #f44336; }
    .status-dot.working { background: #FF9800; animation: blink 1s infinite; }
    @keyframes blink { 50% { opacity: 0.3; } }
    #sms-sync-panel .info {
      color: #666;
      margin-bottom: 10px;
      font-size: 13px;
      line-height: 1.6;
    }
    #sms-sync-panel .btn {
      display: block;
      width: 100%;
      padding: 8px 0;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      margin-top: 6px;
      transition: background 0.2s;
    }
    #sms-sync-panel .btn-start {
      background: #4CAF50;
      color: #fff;
    }
    #sms-sync-panel .btn-start:hover { background: #45a049; }
    #sms-sync-panel .btn-start:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    #sms-sync-panel .btn-reset {
      background: #eee;
      color: #666;
    }
    #sms-sync-panel .btn-reset:hover { background: #ddd; }
    #sms-sync-panel .log {
      margin-top: 10px;
      max-height: 120px;
      overflow-y: auto;
      font-size: 12px;
      color: #888;
      border-top: 1px solid #eee;
      padding-top: 8px;
    }
    #sms-sync-panel .log div { margin-bottom: 2px; }
    #sms-sync-panel .log .success { color: #4CAF50; }
    #sms-sync-panel .log .error { color: #f44336; }
    #sms-sync-panel .server-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 8px;
      box-sizing: border-box;
    }
  `);

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'sms-sync-panel';
    panel.innerHTML = `
      <div class="title">
        <span class="status-dot offline" id="sms-status-dot"></span>
        SMS验证码同步
      </div>
      <input class="server-input" id="sms-server-url" placeholder="服务器地址" value="${CONFIG.SERVER_URL}">
      <div class="info" id="sms-info">等待操作...</div>
      <button class="btn btn-start" id="sms-btn-start">开始自动填写</button>
      <button class="btn btn-reset" id="sms-btn-reset">清空验证码</button>
      <div class="log" id="sms-log"></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('sms-btn-start').addEventListener('click', startProcess);
    document.getElementById('sms-btn-reset').addEventListener('click', resetCode);

    // 可拖拽
    makeDraggable(panel);
  }

  function makeDraggable(el) {
    let offsetX, offsetY, dragging = false;
    el.querySelector('.title').style.cursor = 'move';
    el.querySelector('.title').addEventListener('mousedown', (e) => {
      dragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => dragging = false);
  }

  function log(msg, type = '') {
    const logEl = document.getElementById('sms-log');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = type;
    div.textContent = `[${time}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setInfo(text) {
    const el = document.getElementById('sms-info');
    if (el) el.textContent = text;
  }

  function setStatus(status) {
    const dot = document.getElementById('sms-status-dot');
    if (!dot) return;
    dot.className = 'status-dot ' + status;
  }

  // ========== 服务器通信 ==========
  function serverGet(path) {
    const url = document.getElementById('sms-server-url')?.value || CONFIG.SERVER_URL;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url + path,
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText)); }
          catch (e) { reject(e); }
        },
        onerror: reject,
        timeout: 5000,
      });
    });
  }

  function serverPost(path, data) {
    const url = document.getElementById('sms-server-url')?.value || CONFIG.SERVER_URL;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: url + path,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(data),
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText)); }
          catch (e) { reject(e); }
        },
        onerror: reject,
        timeout: 5000,
      });
    });
  }

  async function checkServer() {
    try {
      const res = await serverGet('/api/status');
      if (res.ok) {
        state.serverConnected = true;
        setStatus('online');
        setInfo(`已连接 | 手机端: ${res.wsClients}台`);
        return true;
      }
    } catch (e) { }
    state.serverConnected = false;
    setStatus('offline');
    setInfo('服务器未连接');
    return false;
  }

  // ========== 核心流程 ==========
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`元素未找到: ${selector}`));
      }, timeout);
    });
  }

  function simulateInput(input, value) {
    input.focus();
    input.value = '';
    // 触发 React 兼容的输入事件
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function simulateClick(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  async function startProcess() {
    if (state.running) return;

    const btn = document.getElementById('sms-btn-start');
    btn.disabled = true;
    btn.textContent = '执行中...';
    state.running = true;

    try {
      // 0. 检查服务器
      log('检查服务器连接...');
      const connected = await checkServer();
      if (!connected) {
        log('无法连接服务器，请先启动PC服务器', 'error');
        throw new Error('服务器未连接');
      }
      log('服务器已连接', 'success');

      // 1. 点击目标元素
      log('查找目标元素...');
      setStatus('working');
      const targetEl = document.querySelector(
        'span.icon-fontst__STFontIcon-editor__sc-1d3hmn1-0.cqDTdz'
      );
      if (!targetEl) {
        // 尝试更宽松的选择器
        const altEl = document.querySelector('span[class*="STFontIcon-editor"]');
        if (altEl) {
          log('使用备选选择器找到元素');
          simulateClick(altEl);
        } else {
          throw new Error('未找到目标元素，请确认页面已加载');
        }
      } else {
        simulateClick(targetEl);
      }
      log('已点击目标元素');
      await sleep(CONFIG.CLICK_DELAY);

      // 2. 输入手机号
      log('查找手机号输入框...');
      // 尝试多种常见选择器
      const phoneInput = await findPhoneInput();
      if (!phoneInput) throw new Error('未找到手机号输入框');

      simulateInput(phoneInput, CONFIG.PHONE);
      log(`已输入手机号: ${CONFIG.PHONE}`, 'success');
      await sleep(500);

      // 3. 自动勾选同意协议复选框
      log('检查同意协议复选框...');
      const checkedBoxes = checkAgreementBoxes();
      if (checkedBoxes.length > 0) {
        log(`已勾选 ${checkedBoxes.length} 个协议复选框: ${checkedBoxes.join(', ')}`, 'success');
        await sleep(500);
      } else {
        log('未发现需要勾选的协议复选框');
      }

      // 4. 点击获取验证码
      log('查找获取验证码按钮...');
      const codeBtn = findCodeButton();
      if (!codeBtn) throw new Error('未找到获取验证码按钮');

      simulateClick(codeBtn);
      log('已点击获取验证码', 'success');
      await sleep(1000);

      // 4.5 检测验证码
      const hasCaptcha = detectCaptcha();
      if (hasCaptcha) {
        log('检测到验证码，请手动完成验证', 'error');
        setInfo('请手动完成验证码...');
        await waitForCaptchaComplete();
        log('验证码已完成', 'success');
        await sleep(1000);
      }

      // 5. 轮询等待验证码
      log('等待手机端同步验证码...');
      setInfo('等待验证码中...');
      const code = await pollForCode();

      // 6. 填入验证码
      log('查找验证码输入框...');
      const codeInput = findCodeInput();
      if (!codeInput) throw new Error('未找到验证码输入框');

      simulateInput(codeInput, code);
      log(`已填入验证码: ${code}`, 'success');
      setInfo('验证码已填入!');

      // 7. 尝试自动提交
      await sleep(500);
      const submitBtn = findSubmitButton();
      if (submitBtn) {
        simulateClick(submitBtn);
        log('已自动提交', 'success');
      }

      setStatus('online');
    } catch (e) {
      log(`错误: ${e.message}`, 'error');
      setInfo(`错误: ${e.message}`);
      setStatus('offline');
    } finally {
      state.running = false;
      state.polling = false;
      if (state.pollTimer) clearInterval(state.pollTimer);
      btn.disabled = false;
      btn.textContent = '开始自动填写';
    }
  }

  async function findPhoneInput() {
    // 等待输入框出现
    const selectors = [
      'input[type="tel"]',
      'input[placeholder*="手机"]',
      'input[placeholder*="phone"]',
      'input[placeholder*="号码"]',
      'input[name*="phone"]',
      'input[name*="mobile"]',
      'input[name*="tel"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // 等待一段时间后重试
    await sleep(2000);
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // 最后尝试找所有可见的 text input
    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of inputs) {
      if (input.offsetParent !== null) return input;
    }

    return null;
  }

  function findCodeButton() {
    const btns = [
      'button',
      '[role="button"]',
      'a',
      'span',
      'div',
    ];
    const keywords = ['获取验证码', '发送验证码', '获取短信', '发送短信', '验证码', '获取code'];

    for (const sel of btns) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        if (keywords.some(k => text.includes(k))) {
          return el;
        }
      }
    }
    return null;
  }

  function findCodeInput() {
    const selectors = [
      'input[placeholder*="验证码"]',
      'input[placeholder*="code"]',
      'input[placeholder*="Code"]',
      'input[name*="code"]',
      'input[name*="captcha"]',
      'input[name*="sms"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // 找第二个可见的 input
    const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input:not([type])');
    const visible = Array.from(inputs).filter(i => i.offsetParent !== null);
    if (visible.length >= 2) return visible[1];

    return null;
  }

  function findSubmitButton() {
    const keywords = ['登录', '注册', '确定', '确认', '提交', 'login', 'register', 'submit', 'confirm'];
    const btns = document.querySelectorAll('button, [type="submit"], [role="button"]');
    for (const el of btns) {
      const text = el.textContent?.trim()?.toLowerCase() || '';
      if (keywords.some(k => text.includes(k))) {
        return el;
      }
    }
    return null;
  }

  // ========== 自动勾选同意协议复选框 ==========
  function checkAgreementBoxes() {
    const checked = [];
    const keywords = ['同意', '已阅读', '已阅读并同意', '隐私政策', '用户协议', '服务条款', 'agree', 'privacy'];

    // 策略1: 查找所有包含关键词的文本，然后找附近的 checkbox
    const allElements = document.querySelectorAll('span, div, label, p');
    for (const el of allElements) {
      const text = el.textContent || '';
      const hasKeyword = keywords.some(k => text.includes(k));

      if (hasKeyword && text.length < 100) {
        // 找到包含关键词的元素，向上查找复选框
        const parent = el.closest('[class*="agree"], [class*="clause"], [class*="Clause"]');
        const searchArea = parent || el.parentElement;

        if (searchArea) {
          // 查找 input[type="checkbox"]
          const cb = searchArea.querySelector('input[type="checkbox"]');
          if (cb && !cb.checked) {
            // 尝试多种点击方式
            cb.click();
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            cb.dispatchEvent(new Event('input', { bubbles: true }));

            // 点击父容器中的可点击元素
            const clickable = searchArea.querySelector('.phoenix-checkbox__box, .phoenix-checkbox__realInput, [class*="box"]');
            if (clickable) {
              clickable.click();
            }

            checked.push(text.trim().substring(0, 30));
            continue;
          }
        }
      }
    }

    // 策略2: 直接查找 phoenix-checkbox 组件
    const phoenixCheckboxes = document.querySelectorAll('.phoenix-checkbox');
    for (const container of phoenixCheckboxes) {
      const parentText = container.closest('[class*="agree"], [class*="clause"], [class*="Clause"]')?.textContent || '';
      const fullText = parentText || container.parentElement?.textContent || '';
      const hasKeyword = keywords.some(k => fullText.includes(k));

      if (hasKeyword) {
        const cb = container.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) {
          // 点击 realInput 或 box
          const realInput = container.querySelector('.phoenix-checkbox__realInput');
          const box = container.querySelector('.phoenix-checkbox__box');

          if (realInput) realInput.click();
          if (box) box.click();
          if (cb) {
            cb.click();
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }

          checked.push(fullText.trim().substring(0, 30));
        }
      }
    }

    // 策略3: 查找所有未勾选的 checkbox，检查周围文本
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
    for (const cb of allCheckboxes) {
      const parent = cb.closest('div, label, span');
      if (!parent) continue;

      // 向上查找包含文本的容器
      let textContainer = parent;
      for (let i = 0; i < 5; i++) {
        if (!textContainer.parentElement) break;
        textContainer = textContainer.parentElement;
        const text = textContainer.textContent || '';
        if (keywords.some(k => text.includes(k))) {
          cb.click();
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          checked.push(text.trim().substring(0, 30));
          break;
        }
      }
    }

    return checked;
  }

  // ========== 验证码处理 ==========
  function detectCaptcha() {
    const selectors = [
      '.geetest_panel_box',
      '.geetest_panel',
      '[class*="captcha"]',
      '[class*="Captcha"]',
      '[class*="verify"]',
      '.slide-verify',
      '#captcha',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  function waitForCaptchaComplete() {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const hasCaptcha = detectCaptcha();
        if (!hasCaptcha) {
          clearInterval(check);
          resolve();
        }
      }, 1000);

      // 5分钟超时
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 300000);
    });
  }

  async function pollForCode() {
    state.polling = true;
    state.pollStart = Date.now();

    return new Promise((resolve, reject) => {
      state.pollTimer = setInterval(async () => {
        const elapsed = Date.now() - state.pollStart;
        if (elapsed > CONFIG.POLL_TIMEOUT) {
          clearInterval(state.pollTimer);
          state.polling = false;
          reject(new Error('等待验证码超时(60秒)'));
          return;
        }

        try {
          const res = await serverGet(`/api/code?ts=${state.pollStart}`);
          if (res.ok && res.code) {
            clearInterval(state.pollTimer);
            state.polling = false;
            log(`收到验证码: ${res.code.code}`, 'success');
            resolve(res.code.code);
          } else {
            const remain = Math.ceil((CONFIG.POLL_TIMEOUT - elapsed) / 1000);
            setInfo(`等待验证码... ${remain}秒`);
          }
        } catch (e) {
          // 网络错误，继续轮询
        }
      }, CONFIG.POLL_INTERVAL);
    });
  }

  async function resetCode() {
    try {
      await serverPost('/api/reset', {});
      log('验证码已清空', 'success');
    } catch (e) {
      log('清空失败: ' + e.message, 'error');
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== 初始化 ==========
  function init() {
    createPanel();
    log('脚本已加载');
    checkServer();

    // 每 10 秒检查一次服务器状态
    setInterval(checkServer, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
