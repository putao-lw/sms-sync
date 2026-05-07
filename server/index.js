const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const HTTP_PORT = 3456;
const WS_PORT = 3457;

// ========== 状态 ==========
let latestCode = null;       // { code, sender, timestamp }
let wsClients = new Set();   // 已连接的 Android 设备

// ========== HTTP 服务 (供油猴脚本调用) ==========
const app = express();
app.use(express.json());

// CORS - 允许任意来源的油猴脚本调用
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 获取服务器状态
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    wsClients: wsClients.size,
    hasCode: !!latestCode,
    latestCode: latestCode
  });
});

// 油猴脚本轮询获取验证码
app.get('/api/code', (req, res) => {
  const ts = parseInt(req.query.ts) || 0;
  if (latestCode && latestCode.timestamp > ts) {
    res.json({ ok: true, code: latestCode });
  } else {
    res.json({ ok: true, code: null });
  }
});

// Android端通过 HTTP 也可以提交验证码
app.post('/api/code', (req, res) => {
  const { code, sender } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: '缺少验证码' });

  latestCode = {
    code: String(code),
    sender: sender || 'unknown',
    timestamp: Date.now()
  };

  console.log(`[HTTP] 收到验证码: ${latestCode.code} (来自: ${latestCode.sender})`);
  res.json({ ok: true, message: '验证码已同步' });
});

// 清空验证码
app.post('/api/reset', (req, res) => {
  latestCode = null;
  console.log('[HTTP] 验证码已清空');
  res.json({ ok: true, message: '已清空' });
});

const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[HTTP] 服务器已启动: http://0.0.0.0:${HTTP_PORT}`);
  console.log(`[HTTP] API: GET /api/status | GET /api/code | POST /api/code | POST /api/reset`);
});

// ========== WebSocket 服务 (供 Android 连接) ==========
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] 设备已连接: ${ip}`);
  wsClients.add(ws);

  // 发送欢迎消息
  ws.send(JSON.stringify({ type: 'connected', message: '已连接到PC服务器' }));

  // 心跳
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) {
      clearInterval(heartbeat);
      ws.terminate();
      return;
    }
    alive = false;
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30000);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'sms_code':
          // 收到 Android 端发来的验证码
          latestCode = {
            code: String(msg.code),
            sender: msg.sender || 'unknown',
            timestamp: Date.now()
          };
          console.log(`[WS] 收到验证码: ${latestCode.code} (来自: ${latestCode.sender})`);
          ws.send(JSON.stringify({ type: 'ack', message: '验证码已同步' }));
          break;

        case 'pong':
          alive = true;
          break;

        default:
          console.log(`[WS] 未知消息类型: ${msg.type}`);
      }
    } catch (e) {
      console.error('[WS] 解析消息失败:', e.message);
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    wsClients.delete(ws);
    console.log(`[WS] 设备已断开: ${ip}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] 错误: ${err.message}`);
  });
});

console.log(`[WS] WebSocket 服务器已启动: ws://0.0.0.0:${WS_PORT}`);

// ========== 启动信息 ==========
const os = require('os');
const interfaces = os.networkInterfaces();
console.log('\n========================================');
console.log('  SMS验证码同步服务器已启动');
console.log('========================================');
console.log(`  HTTP API:  http://localhost:${HTTP_PORT}`);
console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
console.log('\n  局域网地址 (Android请使用以下IP):');
for (const [name, addrs] of Object.entries(interfaces)) {
  for (const addr of addrs) {
    if (addr.family === 'IPv4' && !addr.internal) {
      console.log(`    ${name}: ${addr.address}`);
    }
  }
}
console.log('========================================\n');
