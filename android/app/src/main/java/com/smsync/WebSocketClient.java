package com.smsync;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class WebSocketClient {

    private static final String TAG = "WebSocketClient";
    private static final int RECONNECT_DELAY = 5000;
    private static final int PING_INTERVAL = 30000;

    public interface Callback {
        void onConnected();
        void onDisconnected(String reason);
        void onCodeReceived(String code, String sender);
        void onError(String error);
    }

    private OkHttpClient client;
    private WebSocket webSocket;
    private String serverUrl;
    private Callback callback;
    private Handler mainHandler;
    private boolean manualClose = false;
    private int reconnectAttempts = 0;

    private final Runnable reconnectRunnable = () -> {
        if (!manualClose) {
            Log.d(TAG, "尝试重连... (" + reconnectAttempts + ")");
            connect(serverUrl, callback);
        }
    };

    public WebSocketClient() {
        mainHandler = new Handler(Looper.getMainLooper());
        client = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build();
    }

    public void connect(String ip, Callback callback) {
        this.serverUrl = ip;
        this.callback = callback;
        this.manualClose = false;

        String url = "ws://" + ip + ":3457";
        Log.d(TAG, "连接: " + url);

        Request request = new Request.Builder().url(url).build();

        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                Log.d(TAG, "已连接");
                reconnectAttempts = 0;
                mainHandler.post(() -> {
                    if (callback != null) callback.onConnected();
                });
                // 启动心跳
                startPing();
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                Log.d(TAG, "收到消息: " + text);
                handleMessage(text);
            }

            @Override
            public void onClosing(WebSocket ws, int code, String reason) {
                Log.d(TAG, "连接关闭: " + reason);
                ws.close(1000, null);
                handleDisconnect(reason);
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.e(TAG, "连接失败: " + t.getMessage());
                handleDisconnect(t.getMessage());
            }
        });
    }

    public void disconnect() {
        manualClose = true;
        mainHandler.removeCallbacks(reconnectRunnable);
        if (webSocket != null) {
            webSocket.close(1000, "用户断开");
            webSocket = null;
        }
    }

    public boolean isConnected() {
        return webSocket != null;
    }

    private void handleMessage(String text) {
        try {
            org.json.JSONObject json = new org.json.JSONObject(text);
            String type = json.optString("type", "");

            switch (type) {
                case "connected":
                    Log.d(TAG, "服务器确认连接");
                    break;
                case "ack":
                    Log.d(TAG, "服务器确认: " + json.optString("message"));
                    break;
                case "ping":
                    // 回复 pong
                    if (webSocket != null) {
                        webSocket.send("{\"type\":\"pong\"}");
                    }
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "解析消息失败: " + e.getMessage());
        }
    }

    public void sendCode(String code, String sender) {
        if (webSocket == null) {
            Log.e(TAG, "未连接，无法发送验证码");
            if (callback != null) {
                mainHandler.post(() -> callback.onError("未连接到服务器"));
            }
            return;
        }

        try {
            org.json.JSONObject json = new org.json.JSONObject();
            json.put("type", "sms_code");
            json.put("code", code);
            json.put("sender", sender);
            json.put("timestamp", System.currentTimeMillis());

            boolean sent = webSocket.send(json.toString());
            if (sent) {
                Log.d(TAG, "验证码已发送: " + code);
            } else {
                Log.e(TAG, "发送失败");
                if (callback != null) {
                    mainHandler.post(() -> callback.onError("发送失败"));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "构建消息失败: " + e.getMessage());
        }
    }

    private void startPing() {
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (webSocket != null && !manualClose) {
                    webSocket.send("{\"type\":\"pong\"}");
                    mainHandler.postDelayed(this, PING_INTERVAL);
                }
            }
        }, PING_INTERVAL);
    }

    private void handleDisconnect(String reason) {
        mainHandler.post(() -> {
            if (callback != null) callback.onDisconnected(reason);
        });

        // 自动重连
        if (!manualClose) {
            reconnectAttempts++;
            int delay = Math.min(RECONNECT_DELAY * reconnectAttempts, 30000);
            mainHandler.postDelayed(reconnectRunnable, delay);
        }
    }
}
