package com.smsync;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final int SMS_PERMISSION_CODE = 1001;
    private static final String PREFS_NAME = "sms_sync_prefs";
    private static final String KEY_IP = "server_ip";

    private EditText etServerIp;
    private Button btnConnect, btnDisconnect;
    private TextView tvStatus, tvLog;
    private ScrollView scrollLog;

    private WebSocketClient wsClient;
    private Handler mainHandler;
    private List<String> logEntries = new ArrayList<>();
    private int codeCount = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mainHandler = new Handler(Looper.getMainLooper());

        initViews();
        loadSavedIp();
        requestSmsPermission();
        setupSmsCallback();
    }

    private void initViews() {
        etServerIp = findViewById(R.id.et_server_ip);
        btnConnect = findViewById(R.id.btn_connect);
        btnDisconnect = findViewById(R.id.btn_disconnect);
        tvStatus = findViewById(R.id.tv_status);
        tvLog = findViewById(R.id.tv_log);
        scrollLog = findViewById(R.id.scroll_log);

        btnConnect.setOnClickListener(v -> connect());
        btnDisconnect.setOnClickListener(v -> disconnect());
    }

    private void loadSavedIp() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String ip = prefs.getString(KEY_IP, "");
        if (!ip.isEmpty()) {
            etServerIp.setText(ip);
        }
    }

    private void saveIp(String ip) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(KEY_IP, ip)
                .apply();
    }

    private void requestSmsPermission() {
        boolean hasReceive = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasRead = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;

        addLog("RECEIVE_SMS 权限: " + (hasReceive ? "已授予" : "未授予"));
        addLog("READ_SMS 权限: " + (hasRead ? "已授予" : "未授予"));

        if (!hasReceive || !hasRead) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS},
                    SMS_PERMISSION_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == SMS_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                addLog("短信权限已授予");
            } else {
                addLog("错误: 需要短信权限才能自动读取验证码", true);
                Toast.makeText(this, "请授予短信权限", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void setupSmsCallback() {
        addLog("设置短信回调...");
        SmsReceiver.setCallback((code, sender) -> {
            addLog("回调被触发: code=" + code);
            mainHandler.post(() -> {
                codeCount++;
                addLog("收到短信验证码: " + code + " (来自: " + sender + ")");

                // 通过 WebSocket 发送到 PC
                if (wsClient != null && wsClient.isConnected()) {
                    wsClient.sendCode(code, sender);
                    addLog("验证码已同步到PC: " + code);
                } else {
                    addLog("未连接到PC，验证码未同步", true);
                }
            });
        });
        addLog("短信回调已设置");
    }

    private void connect() {
        String ip = etServerIp.getText().toString().trim();
        if (ip.isEmpty()) {
            Toast.makeText(this, "请输入PC的IP地址", Toast.LENGTH_SHORT).show();
            return;
        }

        saveIp(ip);
        btnConnect.setEnabled(false);
        setStatus("连接中...", "#FF9800");
        addLog("正在连接: " + ip + ":3457");

        wsClient = new WebSocketClient();
        wsClient.connect(ip, new WebSocketClient.Callback() {
            @Override
            public void onConnected() {
                setStatus("已连接", "#4CAF50");
                btnConnect.setEnabled(false);
                btnDisconnect.setEnabled(true);
                addLog("已连接到PC服务器");
            }

            @Override
            public void onDisconnected(String reason) {
                setStatus("已断开", "#f44336");
                btnConnect.setEnabled(true);
                btnDisconnect.setEnabled(false);
                addLog("连接断开: " + (reason != null ? reason : "未知原因"));
            }

            @Override
            public void onCodeReceived(String code, String sender) {
                // 由 SmsReceiver 回调处理
            }

            @Override
            public void onError(String error) {
                addLog("错误: " + error, true);
            }
        });

    }

    private void disconnect() {
        if (wsClient != null) {
            wsClient.disconnect();
            wsClient = null;
        }
        setStatus("已断开", "#9E9E9E");
        btnConnect.setEnabled(true);
        btnDisconnect.setEnabled(false);
        addLog("已手动断开连接");
    }

    private void setStatus(String text, String color) {
        tvStatus.setText(text);
        tvStatus.setTextColor(android.graphics.Color.parseColor(color));
    }

    private void addLog(String msg) {
        addLog(msg, false);
    }

    private void addLog(String msg, boolean isError) {
        String time = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date());
        String prefix = isError ? "[错误] " : "";
        String entry = "[" + time + "] " + prefix + msg;
        logEntries.add(entry);

        // 保留最近50条
        while (logEntries.size() > 50) {
            logEntries.remove(0);
        }

        StringBuilder sb = new StringBuilder();
        for (String line : logEntries) {
            sb.append(line).append("\n");
        }
        tvLog.setText(sb.toString().trim());

        // 自动滚动到底部
        scrollLog.post(() -> scrollLog.fullScroll(View.FOCUS_DOWN));
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (wsClient != null) {
            wsClient.disconnect();
        }
        SmsReceiver.setCallback(null);
    }
}
