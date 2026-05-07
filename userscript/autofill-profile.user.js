// ==UserScript==
// @name         招聘表单自动填写
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动填写招聘网站表单，从配置文件读取个人信息
// @author       sms-sync
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ========== 配置 ==========
  const CONFIG = {
    // 配置文件 URL，可以是本地文件或在线地址
    PROFILE_URL: 'http://localhost:3456/profile.json',
    // 或者直接在这里填写个人信息
    INLINE_PROFILE: null
  };

  // ========== 默认配置文件结构 ==========
  const DEFAULT_PROFILE = {
    personalInfo: {
      name: "",
      englishName: "",
      idType: "身份证",
      idNumber: "",
      gender: "",
      birthday: "",
      email: "",
      nationality: "",
      nativePlace: "",
      currentCity: "",
      phone: "",
      qq: "",
      wechat: ""
    },
    jobIntention: {
      city1: "",
      city2: "",
      acceptCityAdjustment: "",
      howToKnow: ""
    },
    education: [],
    internship: [],
    awards: [],
    certificates: [],
    papers: [],
    projects: [],
    skills: ""
  };

  // ========== 状态 ==========
  let state = {
    profile: null,
    running: false
  };

  // ========== UI ==========
  GM_addStyle(`
    #autofill-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: #fff;
      border: 2px solid #2196F3;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      min-width: 280px;
      max-height: 80vh;
      overflow-y: auto;
      user-select: none;
    }
    #autofill-panel .title {
      font-weight: bold;
      font-size: 16px;
      margin-bottom: 12px;
      color: #2196F3;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #autofill-panel .btn {
      display: block;
      width: 100%;
      padding: 10px 0;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.2s;
    }
    #autofill-panel .btn-primary {
      background: #2196F3;
      color: #fff;
    }
    #autofill-panel .btn-primary:hover { background: #1976D2; }
    #autofill-panel .btn-primary:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    #autofill-panel .btn-secondary {
      background: #f5f5f5;
      color: #333;
    }
    #autofill-panel .btn-secondary:hover { background: #e0e0e0; }
    #autofill-panel .btn-success {
      background: #4CAF50;
      color: #fff;
    }
    #autofill-panel .btn-success:hover { background: #388E3C; }
    #autofill-panel .section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #eee;
    }
    #autofill-panel .section-title {
      font-weight: bold;
      color: #666;
      margin-bottom: 8px;
      font-size: 13px;
    }
    #autofill-panel .checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #autofill-panel .checkbox-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    #autofill-panel .log {
      margin-top: 12px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 12px;
      color: #888;
      border-top: 1px solid #eee;
      padding-top: 8px;
    }
    #autofill-panel .log div { margin-bottom: 2px; }
    #autofill-panel .log .success { color: #4CAF50; }
    #autofill-panel .log .error { color: #f44336; }
    #autofill-panel .log .info { color: #2196F3; }
    #autofill-panel textarea {
      width: 100%;
      height: 100px;
      margin-top: 8px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      resize: vertical;
      box-sizing: border-box;
    }
    #autofill-panel .btn-small {
      padding: 6px 12px;
      font-size: 12px;
      margin-top: 4px;
    }
  `);

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'autofill-panel';
    panel.innerHTML = `
      <div class="title">
        <span>📝</span>
        招聘表单自动填写
      </div>

      <div class="section">
        <div class="section-title">配置来源</div>
        <button class="btn btn-secondary btn-small" id="btn-load-url">从URL加载配置</button>
        <button class="btn btn-secondary btn-small" id="btn-load-local">从本地存储加载</button>
        <button class="btn btn-secondary btn-small" id="btn-import">导入JSON配置</button>
      </div>

      <div class="section">
        <div class="section-title">自动填写选项</div>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input type="checkbox" id="fill-personal" checked> 个人信息
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="fill-job" checked> 求职意向
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="fill-education" checked> 教育经历
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="fill-internship" checked> 实习经历
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="fill-awards" checked> 获奖情况
          </label>
        </div>
      </div>

      <button class="btn btn-primary" id="btn-fill">开始自动填写</button>
      <button class="btn btn-success" id="btn-save">保存当前配置</button>

      <div class="log" id="autofill-log"></div>

      <div class="section">
        <div class="section-title">导入配置</div>
        <textarea id="import-json" placeholder="粘贴 JSON 配置到这里..."></textarea>
        <button class="btn btn-secondary btn-small" id="btn-do-import">确认导入</button>
      </div>
    `;
    document.body.appendChild(panel);

    // 绑定事件
    document.getElementById('btn-load-url').addEventListener('click', loadFromUrl);
    document.getElementById('btn-load-local').addEventListener('click', loadFromLocal);
    document.getElementById('btn-import').addEventListener('click', toggleImportArea);
    document.getElementById('btn-fill').addEventListener('click', startAutoFill);
    document.getElementById('btn-save').addEventListener('click', saveToLocal);
    document.getElementById('btn-do-import').addEventListener('click', importJson);

    // 拖拽
    makeDraggable(panel);
  }

  function makeDraggable(el) {
    let offsetX, offsetY, dragging = false;
    const title = el.querySelector('.title');
    title.style.cursor = 'move';
    title.addEventListener('mousedown', (e) => {
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
    const logEl = document.getElementById('autofill-log');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = type;
    div.textContent = `[${time}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ========== 配置加载 ==========
  async function loadFromUrl() {
    log('从URL加载配置...', 'info');
    try {
      const response = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: CONFIG.PROFILE_URL,
          onload: (res) => {
            try { resolve(JSON.parse(res.responseText)); }
            catch (e) { reject(e); }
          },
          onerror: reject,
          timeout: 5000,
        });
      });

      state.profile = response;
      log('配置加载成功', 'success');
      log('姓名: ' + state.profile.personalInfo?.name, 'info');
    } catch (e) {
      log('加载失败: ' + e.message, 'error');
    }
  }

  function loadFromLocal() {
    const saved = GM_getValue('autofill_profile', null);
    if (saved) {
      try {
        state.profile = JSON.parse(saved);
        log('从本地存储加载成功', 'success');
        log('姓名: ' + state.profile.personalInfo?.name, 'info');
      } catch (e) {
        log('本地配置解析失败', 'error');
      }
    } else {
      log('没有找到本地配置', 'error');
    }
  }

  function saveToLocal() {
    if (!state.profile) {
      log('没有配置可保存', 'error');
      return;
    }
    GM_setValue('autofill_profile', JSON.stringify(state.profile));
    log('配置已保存到本地存储', 'success');
  }

  function toggleImportArea() {
    const textarea = document.getElementById('import-json');
    textarea.style.display = textarea.style.display === 'none' ? 'block' : 'none';
  }

  function importJson() {
    const textarea = document.getElementById('import-json');
    const jsonStr = textarea.value.trim();
    if (!jsonStr) {
      log('请输入 JSON 配置', 'error');
      return;
    }

    try {
      state.profile = JSON.parse(jsonStr);
      log('配置导入成功', 'success');
      log('姓名: ' + state.profile.personalInfo?.name, 'info');
      textarea.value = '';
      textarea.style.display = 'none';
    } catch (e) {
      log('JSON 格式错误: ' + e.message, 'error');
    }
  }

  // ========== 表单填写工具函数 ==========
  function simulateReactInput(input, value) {
    if (!input || !value) return false;

    input.focus();

    // 使用原生 setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const setter = input.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  }

  function simulateClick(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  function findInputByLabel(labelText) {
    // 查找包含指定文本的 label 旁边的 input
    const labels = document.querySelectorAll('label, span, div, td');
    for (const label of labels) {
      if (label.textContent?.trim()?.includes(labelText)) {
        // 查找相邻的 input
        const parent = label.closest('tr, div, .form-item, .ant-form-item');
        if (parent) {
          const input = parent.querySelector('input, textarea, select');
          if (input) return input;
        }
        // 查找 label 的 for 属性
        const forId = label.getAttribute('for');
        if (forId) {
          return document.getElementById(forId);
        }
      }
    }
    return null;
  }

  function findInputByPlaceholder(placeholder) {
    return document.querySelector(`input[placeholder*="${placeholder}"], textarea[placeholder*="${placeholder}"]`);
  }

  function selectDropdownOption(dropdownEl, optionText) {
    if (!dropdownEl) return false;

    // 点击打开下拉框
    simulateClick(dropdownEl);
    sleep(300);

    // 查找选项
    const options = document.querySelectorAll('.ant-select-item-option, .el-select-dropdown__item, li[role="option"]');
    for (const opt of options) {
      if (opt.textContent?.trim()?.includes(optionText)) {
        simulateClick(opt);
        return true;
      }
    }

    // 尝试输入搜索
    const input = dropdownEl.querySelector('input');
    if (input) {
      simulateReactInput(input, optionText);
      sleep(500);
      const searchOptions = document.querySelectorAll('.ant-select-item-option, .el-select-dropdown__item');
      for (const opt of searchOptions) {
        if (opt.textContent?.trim()?.includes(optionText)) {
          simulateClick(opt);
          return true;
        }
      }
    }

    return false;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== 自动填写逻辑 ==========
  async function startAutoFill() {
    if (state.running) return;
    if (!state.profile) {
      log('请先加载配置', 'error');
      return;
    }

    state.running = true;
    const btn = document.getElementById('btn-fill');
    btn.disabled = true;
    btn.textContent = '填写中...';

    try {
      const fillPersonal = document.getElementById('fill-personal').checked;
      const fillJob = document.getElementById('fill-job').checked;
      const fillEducation = document.getElementById('fill-education').checked;
      const fillInternship = document.getElementById('fill-internship').checked;
      const fillAwards = document.getElementById('fill-awards').checked;

      if (fillPersonal) {
        await fillPersonalInfo();
      }

      if (fillJob) {
        await fillJobIntention();
      }

      if (fillEducation) {
        await fillEducationInfo();
      }

      if (fillInternship) {
        await fillInternshipInfo();
      }

      if (fillAwards) {
        await fillAwardsInfo();
      }

      log('自动填写完成！', 'success');
    } catch (e) {
      log('填写出错: ' + e.message, 'error');
    } finally {
      state.running = false;
      btn.disabled = false;
      btn.textContent = '开始自动填写';
    }
  }

  async function fillPersonalInfo() {
    log('填写个人信息...', 'info');
    const info = state.profile.personalInfo;
    if (!info) return;

    const fields = [
      { label: '姓名', value: info.name },
      { label: '英文名', value: info.englishName },
      { label: '证件号码', value: info.idNumber },
      { label: '邮箱', value: info.email },
      { label: '手机号码', value: info.phone },
      { label: 'QQ', value: info.qq },
      { label: '微信号', value: info.wechat }
    ];

    for (const field of fields) {
      if (field.value) {
        const input = findInputByLabel(field.label) || findInputByPlaceholder(field.label);
        if (input) {
          simulateReactInput(input, field.value);
          log(`  ${field.label}: ${field.value}`, 'success');
          await sleep(200);
        } else {
          log(`  ${field.label}: 未找到输入框`, 'error');
        }
      }
    }

    // 性别选择
    if (info.gender) {
      const genderRadio = document.querySelector(`input[value="${info.gender}"]`);
      if (genderRadio) {
        simulateClick(genderRadio);
        log(`  性别: ${info.gender}`, 'success');
      }
    }
  }

  async function fillJobIntention() {
    log('填写求职意向...', 'info');
    const intention = state.profile.jobIntention;
    if (!intention) return;

    // 这些通常是下拉选择框
    const fields = [
      { label: '意向工作地点', value: intention.city1 },
      { label: '其他意向城市1', value: intention.city1 },
      { label: '其他意向城市2', value: intention.city2 }
    ];

    for (const field of fields) {
      if (field.value) {
        const input = findInputByLabel(field.label);
        if (input) {
          const select = input.closest('.ant-select, .el-select');
          if (select) {
            selectDropdownOption(select, field.value);
            log(`  ${field.label}: ${field.value}`, 'success');
          } else {
            simulateReactInput(input, field.value);
            log(`  ${field.label}: ${field.value}`, 'success');
          }
          await sleep(300);
        }
      }
    }
  }

  async function fillEducationInfo() {
    log('填写教育经历...', 'info');
    const educations = state.profile.education;
    if (!educations || educations.length === 0) return;

    // 查找所有教育经历表单项
    const eduSections = document.querySelectorAll('[class*="education"], [class*="edu-"]');
    log(`  找到 ${educations.length} 条教育经历配置`, 'info');

    // 这里需要根据实际页面结构调整
    // 通常需要点击"添加教育经历"按钮，然后填写表单
  }

  async function fillInternshipInfo() {
    log('填写实习经历...', 'info');
    const internships = state.profile.internship;
    if (!internships || internships.length === 0) return;

    log(`  找到 ${internships.length} 条实习经历配置`, 'info');

    // 查找所有实习经历表单项
    const internSections = document.querySelectorAll('[class*="internship"], [class*="intern-"]');

    // 这里需要根据实际页面结构调整
  }

  async function fillAwardsInfo() {
    log('填写获奖情况...', 'info');
    const awards = state.profile.awards;
    if (!awards || awards.length === 0) return;

    log(`  找到 ${awards.length} 条获奖配置`, 'info');

    // 这里需要根据实际页面结构调整
  }

  // ========== 初始化 ==========
  function init() {
    createPanel();
    log('脚本已加载');

    // 尝试从本地存储加载配置
    const saved = GM_getValue('autofill_profile', null);
    if (saved) {
      try {
        state.profile = JSON.parse(saved);
        log('已加载本地配置: ' + state.profile.personalInfo?.name, 'success');
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 显示/隐藏面板的快捷键
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'a') {
        const panel = document.getElementById('autofill-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
