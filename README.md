# SMS验证码同步系统

局域网内 PC 油猴脚本 + Android 手机自动同步验证码。

## 架构

```
PC浏览器(油猴脚本)  ←HTTP轮询→  PC本地服务器(Node.js)  ←WebSocket→  Android APK
   自动点击/填写                     中转验证码                     自动读取短信
```

## 快速开始

### 1. 启动 PC 服务器

```bash
cd server
npm install
npm start
```

启动后会显示局域网 IP 地址，记下这个 IP 给手机端使用。

### 2. 安装油猴脚本

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开 Tampermonkey 管理面板 → 新建脚本
3. 将 `userscript/sms-autofill.user.js` 的内容粘贴进去并保存
4. 打开目标网页，右下角会出现控制面板

### 3. 获取 Android APK

**方式一：GitHub 自动构建（推荐，无需电脑装 Android Studio）**

1. 双击运行 `setup-github.bat`，按提示推送到 GitHub
2. 打开 GitHub 仓库页面 → 点击 **Actions** 标签
3. 等待构建完成（约3-5分钟），绿色勾表示成功
4. **下载 APK 有两种方式：**
   - **方式 A（Actions 产物）**: 点击成功的构建任务 → 滑到底部 **Artifacts** → 下载 `sms-sync-apk` → 解压得到 `app-debug.apk`
   - **方式 B（Releases）**: 仓库页面右侧点击 **Releases** → 下载 `app-debug.apk`
5. 将 APK 传到手机（微信/QQ/数据线均可），安装时允许"未知来源"

**方式二：Android Studio 编译**

用 Android Studio 打开 `android/` 目录，点击 Build → Build APK。

**方式三：在线 APK 构建服务（无需本地任何环境）**

如果不想用 GitHub Actions，可以使用在线 APK 构建服务：
1. 打开 https://appetize.io/ 或 https://www.buildfire.com/ 等在线构建平台
2. 或者使用 https://github.com/niclaslindstedt/apk-builder 等开源工具
3. 上传 `android/` 目录的代码，在线编译后下载 APK

> 最推荐的方式一，免费且自动，只需一个 GitHub 账号。

### 4. 使用流程

1. **PC端**: 启动服务器 `npm start`
2. **手机端**: 打开 APP，输入 PC 的 IP 地址，点击"连接"
3. **PC端**: 打开目标网页，点击右下角"开始自动填写"
4. 脚本自动：点击目标元素 → 输入手机号 → 点击获取验证码
5. 手机收到短信 → APP 自动提取验证码 → 通过 WebSocket 同步到 PC
6. 脚本自动将验证码填入页面

## 配置说明

### 油猴脚本配置 (在脚本顶部修改)

```javascript
const CONFIG = {
  PHONE: '13607540625',        // 固定手机号
  SERVER_URL: 'http://localhost:3456',  // 服务器地址
  POLL_INTERVAL: 2000,         // 轮询间隔(ms)
  POLL_TIMEOUT: 60000,         // 超时时间(ms)
};
```

### 服务器端口

- HTTP API: 3456 (油猴脚本调用)
- WebSocket: 3457 (Android 连接)

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 服务器状态和连接数 |
| GET | `/api/code?ts=xxx` | 获取最新验证码 |
| POST | `/api/code` | 提交验证码 `{code, sender}` |
| POST | `/api/reset` | 清空验证码 |

## 注意事项

- PC 和手机必须在同一局域网
- Android 6.0+ 需要手动授予短信权限
- 脚本的选择器是通用的，如果目标网站结构不同可能需要调整
- 验证码有效期 60 秒，超时需重新获取
