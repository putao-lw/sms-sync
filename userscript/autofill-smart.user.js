// ==UserScript==
// @name         智能表单自动填写（学习型）
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  记录你填写过的内容，下次自动填写相同字段
// @author       sms-sync
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ========== 配置 ==========
  const STORAGE_KEY = 'smart_autofill_data';
  const SAVE_DELAY = 500; // 输入后延迟保存（防抖）
  const DEBUG = true; // 开启调试模式

  // ========== 状态 ==========
  let state = {
    data: {},           // 学习到的数据 { fieldKey: value }
    enabled: true,      // 是否启用自动填写
    saveTimer: null,    // 保存防抖定时器
    watching: false     // 是否正在监听
  };

  // ========== UI ==========
  GM_addStyle(`
    #smart-autofill-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: #fff;
      border: 2px solid #67C23A;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      min-width: 240px;
      max-height: 70vh;
      overflow-y: auto;
      user-select: none;
    }
    #smart-autofill-panel .title {
      font-weight: bold;
      font-size: 15px;
      margin-bottom: 10px;
      color: #67C23A;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #smart-autofill-panel .btn {
      display: block;
      width: 100%;
      padding: 8px 0;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      margin-top: 6px;
      transition: all 0.2s;
    }
    #smart-autofill-panel .btn-primary {
      background: #67C23A;
      color: #fff;
    }
    #smart-autofill-panel .btn-primary:hover { background: #5daf34; }
    #smart-autofill-panel .btn-secondary {
      background: #f5f5f5;
      color: #333;
      border: 1px solid #ddd;
    }
    #smart-autofill-panel .btn-secondary:hover { background: #e8e8e8; }
    #smart-autofill-panel .btn-danger {
      background: #fff;
      color: #f44336;
      border: 1px solid #f44336;
    }
    #smart-autofill-panel .btn-danger:hover { background: #f44336; color: #fff; }
    #smart-autofill-panel .btn-small {
      padding: 5px 10px;
      font-size: 12px;
      display: inline-block;
      width: auto;
      margin-right: 4px;
    }
    #smart-autofill-panel .info {
      color: #666;
      font-size: 12px;
      margin: 8px 0;
      padding: 8px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    #smart-autofill-panel .log {
      margin-top: 10px;
      max-height: 120px;
      overflow-y: auto;
      font-size: 11px;
      color: #888;
      border-top: 1px solid #eee;
      padding-top: 8px;
    }
    #smart-autofill-panel .log div { margin-bottom: 2px; }
    #smart-autofill-panel .log .success { color: #67C23A; }
    #smart-autofill-panel .log .error { color: #f44336; }
    #smart-autofill-panel .log .info { color: #409EFF; }
    #smart-autofill-panel .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 20px;
    }
    #smart-autofill-panel .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    #smart-autofill-panel .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .3s;
      border-radius: 20px;
    }
    #smart-autofill-panel .toggle-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    #smart-autofill-panel input:checked + .toggle-slider {
      background-color: #67C23A;
    }
    #smart-autofill-panel input:checked + .toggle-slider:before {
      transform: translateX(20px);
    }
    #smart-autofill-panel .data-preview {
      margin-top: 8px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      max-height: 150px;
      overflow-y: auto;
      display: none;
    }
    #smart-autofill-panel .btn-group {
      display: flex;
      gap: 4px;
      margin-top: 8px;
    }
    #smart-autofill-panel .btn-group .btn {
      flex: 1;
    }
    .smart-autofill-highlight {
      outline: 2px solid #67C23A !important;
      outline-offset: -2px;
    }
  `);

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'smart-autofill-panel';
    panel.innerHTML = `
      <div class="title">
        <span>🧠 智能表单填写</span>
        <label class="toggle-switch" title="启用/禁用自动填写">
          <input type="checkbox" id="saf-enabled" ${state.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="info" id="saf-info">
        已记录 <strong>${Object.keys(state.data).length}</strong> 个字段
      </div>

      <button class="btn btn-primary" id="saf-fill">自动填写当前页面</button>

      <div class="btn-group">
        <button class="btn btn-secondary btn-small" id="saf-export">导出配置</button>
        <button class="btn btn-secondary btn-small" id="saf-import">导入配置</button>
      </div>

      <button class="btn btn-secondary" id="saf-preview">查看已保存数据</button>
      <button class="btn btn-secondary" id="saf-scan">扫描页面字段</button>
      <button class="btn btn-danger" id="saf-clear-all">清空所有数据（重置）</button>

      <div class="data-preview" id="saf-data-preview"></div>
      <div class="log" id="saf-log"></div>
      <input type="file" id="saf-file-input" accept=".json" style="display:none">
    `;
    document.body.appendChild(panel);

    // 绑定事件
    document.getElementById('saf-enabled').addEventListener('change', toggleEnabled);
    document.getElementById('saf-fill').addEventListener('click', fillCurrentPage);
    document.getElementById('saf-export').addEventListener('click', exportData);
    document.getElementById('saf-import').addEventListener('click', () => {
      document.getElementById('saf-file-input').click();
    });
    document.getElementById('saf-file-input').addEventListener('change', importData);
    document.getElementById('saf-preview').addEventListener('click', togglePreview);
    document.getElementById('saf-scan').addEventListener('click', scanPageFields);
    document.getElementById('saf-clear-all').addEventListener('click', clearAllData);

    makeDraggable(panel);
  }

  function makeDraggable(el) {
    let offsetX, offsetY, dragging = false;
    const title = el.querySelector('.title');
    title.style.cursor = 'move';
    title.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toggle-switch')) return;
      dragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
      el.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => dragging = false);
  }

  function log(msg, type = '') {
    const logEl = document.getElementById('saf-log');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = type;
    div.textContent = `[${time}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateInfo() {
    const infoEl = document.getElementById('saf-info');
    if (infoEl) {
      infoEl.innerHTML = `已记录 <strong>${Object.keys(state.data).length}</strong> 个字段`;
    }
  }

  // ========== 核心功能 ==========

  // 生成字段唯一标识
  function getFieldKey(input) {
    let key = null;
    let debugInfo = { name: input.name, id: input.id, placeholder: input.placeholder, type: input.type };

    // 优先使用 name 属性
    if (input.name && input.name.length > 0) {
      key = `name:${input.name}`;
    }
    // 使用 id 属性（排除自动生成的 id）
    else if (input.id && input.id.length > 0 && !input.id.startsWith('el-') && !input.id.startsWith('phoenix-')) {
      key = `id:${input.id}`;
    }
    // 使用 placeholder（排除通用占位符）
    else if (input.placeholder && input.placeholder.length > 0 &&
             !['请输入', '请选择', '请选择日期', '请选择时间'].includes(input.placeholder)) {
      key = `placeholder:${input.placeholder}`;
    }
    // 使用相邻的 label 文本
    else {
      const label = findRelatedLabel(input);
      if (label && label.length > 0) {
        key = `label:${label}`;
      }
    }

    // 如果还是没有找到标识，使用页面+表单+索引的方式
    if (!key) {
      const form = input.closest('form') || input.closest('[class*="form"]');
      const formId = form ? (form.id || form.className || 'form') : 'page';
      const inputs = Array.from(document.querySelectorAll(input.tagName)).filter(isValidInput);
      const index = inputs.indexOf(input);
      key = `field:${formId}:${index}`;
    }

    if (DEBUG) {
      console.log('[SmartAutofill] getFieldKey:', key, debugInfo, input);
    }

    return key;
  }

  // 查找关联的 label
  function findRelatedLabel(input) {
    // 通过 for 属性
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        const text = label.textContent.trim();
        if (text && text.length < 30) return text;
      }
    }

    // 通过包裹的 label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      const text = parentLabel.textContent.replace(input.value, '').trim();
      if (text && text.length < 30) return text;
    }

    // 北森/Phoenix 特殊处理 - 改进版
    // 找到直接包裹 input 的 form-item（使用逐步上溯找最近的）
    const phoenixItem = findDirectFormItem(input);
    if (phoenixItem) {
      const labelEl = phoenixItem.querySelector(
        '.phoenix-form-item__label, .ant-form-item-label, .form-item-label, .form-label'
      );
      if (labelEl) {
        const text = labelEl.textContent.trim().replace(/[:：]/g, '');
        if (text && text.length >= 2 && text.length < 20) {
          const cleanText = text.replace(/^\*\s*/, '').trim();
          if (cleanText.length >= 2 && !isCommonValue(cleanText)) {
            return cleanText;
          }
        }
      }

      // 尝试查找 aria-label 属性
      const ariaLabel = phoenixItem.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.length < 20 && !isCommonValue(ariaLabel)) {
        return ariaLabel;
      }

      // 查找最近的 <label> 或带 label 类的同级元素（排除子元素中的值文本）
      const allLabels = phoenixItem.querySelectorAll('label, [class*="label"]');
      for (const lbl of allLabels) {
        // 确保 label 不是 input 的子容器（排除 select 内部的 label）
        if (lbl.contains(input)) continue;
        const text = lbl.textContent.trim().replace(/[:：*]/g, '');
        if (text && text.length >= 2 && text.length < 20 && !isCommonValue(text)) {
          const cleanText = text.replace(/^\*\s*/, '').trim();
          if (cleanText.length >= 2) {
            return cleanText;
          }
        }
      }
    }

    // 尝试用 aria-label 属性直接获取
    const directAriaLabel = input.getAttribute('aria-label');
    if (directAriaLabel && directAriaLabel.length < 20 && !isCommonValue(directAriaLabel)) {
      return directAriaLabel;
    }

    // 查找最近的包含"标签"的父元素
    let parent = input.parentElement;
    for (let i = 0; i < 5; i++) {
      if (!parent) break;

      // 查找同级的标签元素
      const labels = parent.querySelectorAll('label, .label, .form-label, span, div');
      for (const label of labels) {
        const text = label.textContent.trim();
        // 排除过长的文本和包含输入值的文本
        if (text && text.length > 1 && text.length < 15 && !text.includes(input.value || '占位')) {
          // 检查是否是真正的标签（通常在输入框前面）
          const rect = label.getBoundingClientRect();
          const inputRect = input.getBoundingClientRect();
          if (rect.top < inputRect.top + 20 && rect.left < inputRect.left + 100) {
            return text;
          }
        }
      }

      parent = parent.parentElement;
    }

    return null;
  }

  // 找到直接包裹 input 的 form-item（逐步上溯，找到第一个就停）
  function findDirectFormItem(input) {
    let el = input.parentElement;
    for (let i = 0; i < 6; i++) {
      if (!el) break;
      if (el.classList && (
        el.classList.contains('phoenix-form-item') ||
        el.classList.contains('ant-form-item') ||
        el.classList.contains('form-item') ||
        el.classList.contains('form-group')
      )) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // 判断文本是否是常见的值文本（不是字段标签）
  function isCommonValue(text) {
    const commonValues = [
      '身份证', '护照', '港澳通行证', '台湾通行证',
      '男', '女', '是', '否',
      '中国', '美国', '日本',
      '请选择', '请输入',
      '本科', '硕士', '博士',
      '全日制', '非全日制',
      '汉族',
      '中共党员', '共青团员', '群众',
      '已婚', '未婚'
    ];
    return commonValues.includes(text);
  }

  // 监听输入事件
  function watchInputs() {
    if (state.watching) return;
    state.watching = true;

    // 监听所有 input 和 textarea
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);

    // 监听 Phoenix/Ant Select 下拉选项点击
    document.addEventListener('click', handleSelectClick, true);

    // 监听动态添加的元素
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // 检查新添加的元素是否是 input
            const inputs = node.querySelectorAll ? node.querySelectorAll('input, textarea, select') : [];
            if (node.matches?.('input, textarea, select')) {
              autoFillSingle(node);
            }
            inputs.forEach(autoFillSingle);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 处理 Phoenix/Ant Select 下拉选项点击
  function handleSelectClick(e) {
    if (!state.enabled) return;

    const option = e.target.closest(
      '.phoenix-select-dropdown__item, .ant-select-item-option, ' +
      '.phoenix-cascader-menu__item, li[role="option"], ' +
      '.phoenix-select-item, [class*="select-item"], [class*="dropdown-item"]'
    );
    if (!option) return;

    const optionText = option.textContent.trim();
    if (!optionText) return;

    // 找到这个选项对应的 select 组件
    const selectDropdown = option.closest(
      '.phoenix-select-dropdown, .ant-select-dropdown, ' +
      '.phoenix-cascader-menus, [class*="select-dropdown"], [class*="dropdown-menu"]'
    );
    if (!selectDropdown) return;

    // 通过 popup 找到对应的触发元素（select 本体）
    // Phoenix select 的 dropdown 通常有 id 或 data 属性关联到触发元素
    const selectEl = findRelatedSelect(selectDropdown);
    if (!selectEl) return;

    // 找到 form-item 容器
    const formItem = findDirectFormItem(selectEl) || selectEl.closest('[class*="form-item"]');
    if (!formItem) return;

    // 找到 label
    const labelEl = formItem.querySelector(
      '.phoenix-form-item__label, .ant-form-item-label, .form-item-label, .form-label, label'
    );
    if (!labelEl) return;

    const labelText = labelEl.textContent.trim().replace(/[:：*]/g, '').replace(/^\*\s*/, '').trim();
    if (!labelText || labelText.length < 2 || isCommonValue(labelText)) return;

    // 保存学习数据
    const key = `label:${labelText}`;
    state.data[key] = optionText;
    saveData();
    log(`学习(选择): ${labelText} → ${optionText}`, 'info');
  }

  // 找到 dropdown 对应的 select 触发元素
  function findRelatedSelect(dropdown) {
    // 方法1: 通过 aria-controls / aria-owns
    const dropdownId = dropdown.id;
    if (dropdownId) {
      const trigger = document.querySelector(`[aria-controls="${dropdownId}"], [aria-owns="${dropdownId}"]`);
      if (trigger) return trigger;
    }

    // 方法2: 找到最近的 phoenix-select 容器
    // dropdown 通常是 body 下的 teleport，所以通过 DOM 位置无法直接找到
    // 尝试通过全局查找有焦点的 select
    const activeEl = document.activeElement;
    if (activeEl && activeEl.closest('.phoenix-select, .ant-select, [class*="select"]')) {
      return activeEl.closest('.phoenix-select, .ant-select, [class*="select"]');
    }

    // 方法3: 查找最近被点击过的 select
    const selects = document.querySelectorAll('.phoenix-select, .ant-select, [class*="select-input"]');
    for (const s of selects) {
      const rect = s.getBoundingClientRect();
      // 检查 select 是否在 dropdown 附近
      if (Math.abs(rect.left - dropdown.offsetLeft) < 300) {
        return s;
      }
    }

    return null;
  }

  function handleInput(e) {
    const input = e.target;
    if (!isValidInput(input)) return;
    if (!state.enabled) return;

    // 跳过密码字段
    if (input.type === 'password') return;

    const key = getFieldKey(input);
    const value = getInputValue(input);

    if (DEBUG) {
      console.log('[SmartAutofill] handleInput:', {
        key: key,
        value: value,
        inputType: input.type,
        inputId: input.id,
        inputName: input.name,
        placeholder: input.placeholder,
        isValid: isValidInput(input),
        hasValue: value && value.length > 0
      });
    }

    // 只学习有效值（长度大于1，且不是纯数字的身份证等特殊情况）
    if (value && value.length > 0) {
      // 检查是否是自动填充的（排除脚本自己填的值）
      if (input.classList.contains('smart-autofill-highlight')) return;

      // 验证值是否合理（防止学习占位符文本）
      if (value === '请输入' || value === '请选择' || value === '请选择日期') {
        if (DEBUG) {
          console.log('[SmartAutofill] 跳过占位符文本:', value);
        }
        return;
      }

      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(() => {
        // 再次验证值没有变化
        const currentValue = getInputValue(input);
        if (currentValue === value) {
          state.data[key] = value;
          saveData();
          log(`学习: ${key.substring(0, 20)} → ${value.substring(0, 15)}`, 'info');
        }
      }, SAVE_DELAY);
    }
  }

  function handleChange(e) {
    const input = e.target;
    // hidden 类型也要学习（Phoenix select 的隐藏 input）
    if (!isValidInput(input) && input.type !== 'hidden') return;
    if (!state.enabled) return;

    const key = getFieldKey(input);
    const value = getInputValue(input);

    if (value && value.length > 0 && value !== '请输入' && value !== '请选择') {
      state.data[key] = value;
      saveData();
      if (DEBUG) {
        console.log('[SmartAutofill] handleChange learned:', key, value);
      }
    }
  }

  function isValidInput(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = el.type.toLowerCase();
      return ['text', 'tel', 'email', 'number', 'url', 'search', 'password'].includes(type);
    }
    return tag === 'textarea' || tag === 'select';
  }

  // 检查是否是可以学习的输入（包括 hidden 类型）
  function isLearnableInput(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = el.type.toLowerCase();
      return ['text', 'tel', 'email', 'number', 'url', 'search', 'hidden'].includes(type);
    }
    return tag === 'textarea' || tag === 'select';
  }

  function getInputValue(input) {
    if (input.tagName.toLowerCase() === 'select') {
      return input.options[input.selectedIndex]?.text || input.value;
    }
    return input.value;
  }

  // 自动填写单个字段
  function autoFillSingle(input) {
    if (!state.enabled) return;
    if (!isValidInput(input)) return;
    if (input.value && input.value.length > 0) return; // 已有值不覆盖
    if (input.type === 'password') return; // 跳过密码字段

    const key = getFieldKey(input);
    const value = state.data[key];

    // 验证值是否合理（防止把身份证填到所有字段）
    if (value && value.length > 0) {
      // 检查值是否适合这个字段类型
      if (input.type === 'email' && !value.includes('@')) return;
      if (input.type === 'tel' && !/^\d+$/.test(value)) return;

      setInputValue(input, value);
      // 添加高亮效果
      input.classList.add('smart-autofill-highlight');
      setTimeout(() => input.classList.remove('smart-autofill-highlight'), 2000);
      log(`自动填写: ${key.substring(0, 20)}`, 'success');
    }
  }

  function setInputValue(input, value) {
    input.focus();

    if (input.tagName.toLowerCase() === 'select') {
      // 对于 select，查找匹配的 option
      for (let i = 0; i < input.options.length; i++) {
        if (input.options[i].text === value || input.options[i].value === value) {
          input.selectedIndex = i;
          break;
        }
      }
    } else {
      // 使用原生 setter（兼容 React）
      const setter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      )?.set;

      if (setter) {
        setter.call(input, value);
      } else {
        input.value = value;
      }
    }

    // 触发事件
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ========== 数据管理 ==========

  function saveData() {
    GM_setValue(STORAGE_KEY, JSON.stringify(state.data));
    updateInfo();
  }

  function loadData() {
    const saved = GM_getValue(STORAGE_KEY, null);
    if (saved) {
      try {
        state.data = JSON.parse(saved);
        log(`已加载 ${Object.keys(state.data).length} 个字段`, 'success');
      } catch (e) {
        state.data = {};
      }
    }
  }

  function exportData() {
    const json = JSON.stringify(state.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autofill-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log('配置已导出', 'success');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        // 合并数据（不覆盖现有）
        state.data = { ...state.data, ...imported };
        saveData();
        log(`已导入 ${Object.keys(imported).length} 个字段`, 'success');
      } catch (e) {
        log('导入失败: JSON 格式错误', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function toggleEnabled(e) {
    state.enabled = e.target.checked;
    log(state.enabled ? '已启用自动填写' : '已禁用自动填写', 'info');
  }

  function togglePreview() {
    const preview = document.getElementById('saf-data-preview');
    if (preview.style.display === 'none') {
      preview.style.display = 'block';
      preview.textContent = JSON.stringify(state.data, null, 2);
    } else {
      preview.style.display = 'none';
    }
  }

  function clearCurrentPageFields() {
    const inputs = document.querySelectorAll('input, textarea, select');
    let count = 0;
    inputs.forEach(input => {
      if (isValidInput(input) && input.value) {
        const key = getFieldKey(input);
        if (state.data[key]) {
          delete state.data[key];
          count++;
        }
      }
    });
    saveData();
    log(`已清空 ${count} 个当前页面字段`, 'info');
  }

  function clearAllData() {
    if (confirm('确定要清空所有已保存的数据吗？建议先导出备份。')) {
      state.data = {};
      saveData();
      log('已清空所有数据', 'info');
    }
  }

  // ========== 自动填写 ==========

  async function fillCurrentPage() {
    log('开始自动填写...', 'info');
    const inputs = document.querySelectorAll('input, textarea, select');
    let filled = 0;

    for (const input of inputs) {
      if (isValidInput(input) && !input.value) {
        const key = getFieldKey(input);
        const value = state.data[key];

        if (value) {
          // 滚动到元素
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(300);

          setInputValue(input, value);
          input.classList.add('smart-autofill-highlight');
          setTimeout(() => input.classList.remove('smart-autofill-highlight'), 2000);
          filled++;

          await sleep(100);
        }
      }
    }

    log(`填写完成，共填写 ${filled} 个字段`, 'success');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 扫描页面所有字段（调试用）
  function scanPageFields() {
    log('--- 扫描页面字段 ---', 'info');
    const inputs = document.querySelectorAll('input, textarea, select');
    let count = 0;

    for (const input of inputs) {
      if (!isValidInput(input)) continue;
      if (input.type === 'password') continue;

      const key = getFieldKey(input);
      const value = getInputValue(input);
      count++;

      const label = findRelatedLabel(input) || '(无标签)';
      const hasSaved = state.data[key] ? '✓' : '✗';

      log(`  ${hasSaved} [${key}] ${label} = "${(value || '').substring(0, 15)}"`, value ? 'success' : '');
    }

    log(`共找到 ${count} 个可填写字段`, 'info');
    log(`已保存 ${Object.keys(state.data).length} 个字段值`, 'info');
    log('--- 扫描结束 ---', 'info');

    // 同时输出到控制台
    if (DEBUG) {
      console.log('[SmartAutofill] 已保存数据:', state.data);
    }
  }

  // ========== 初始化 ==========

  function init() {
    loadData();
    createPanel();
    watchInputs();

    // 自动填写当前页面已有但为空的字段
    setTimeout(() => {
      if (state.enabled) {
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(autoFillSingle);
      }
    }, 1000);

    // 快捷键显示/隐藏面板
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 's') {
        const panel = document.getElementById('smart-autofill-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });

    log('智能填写已启动 (Alt+S 显示/隐藏)', 'success');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
