package com.smsync;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
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
    private ContentObserver smsObserver;
    private long lastSmsTimestamp = 0;

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
                startSmsObserver();
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

        // 如果已有权限，直接启动 Observer
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED) {
            startSmsObserver();
        }
    }

    private void startSmsObserver() {
        addLog("启动短信监听(ContentObserver)...");
        lastSmsTimestamp = System.currentTimeMillis();

        smsObserver = new ContentObserver(mainHandler) {
            @Override
            public void onChange(boolean selfChange, Uri uri) {
                super.onChange(selfChange, uri);
                addLog("短信数据库变化: " + uri);
                readLatestSms();
            }
        };

        getContentResolver().registerContentObserver(
                Uri.parse("content://sms"),
                true,
                smsObserver
        );
        addLog("短信监听已启动");
    }

    private void readLatestSms() {
        try {
            addLog("查询短信, 时间戳: " + lastSmsTimestamp);

            // 先查询所有短信，不限制时间
            Cursor cursor = getContentResolver().query(
                    Uri.parse("content://sms/inbox"),
                    new String[]{"_id", "address", "body", "date", "read"},
                    null,
                    null,
                    "date DESC"
            );

            if (cursor != null) {
                addLog("查询到 " + cursor.getCount() + " 条短信");

                if (cursor.moveToFirst()) {
                    int id = cursor.getInt(0);
                    String sender = cursor.getString(1);
                    String body = cursor.getString(2);
                    long date = cursor.getLong(3);
                    int read = cursor.getInt(4);

                    addLog("最新短信: id=" + id + " date=" + date + " read=" + read);
                    addLog("发送者: " + sender);
                    addLog("内容: " + body.substring(0, Math.min(50, body.length())));

                    // 只处理比上次时间戳新的短信
                    if (date > lastSmsTimestamp) {
                        addLog("是新短信，提取验证码...");

                        // 提取验证码
                        String code = SmsReceiver.extractCode(body);
                        if (code != null) {
                            lastSmsTimestamp = date;
                            addLog("提取到验证码: " + code);

                            // 发送到 PC
                            if (wsClient != null && wsClient.isConnected()) {
                                wsClient.sendCode(code, sender);
                                addLog("验证码已同步到PC: " + code);
                            } else {
                                addLog("未连接到PC，验证码未同步", true);
                            }
                        } else {
                            addLog("未提取到验证码");
                        }
                    } else {
                        addLog("不是新短信, date=" + date + " <= lastTs=" + lastSmsTimestamp);
                    }
                } else {
                    addLog("没有短信记录");
                }
                cursor.close();
            } else {
                addLog("查询失败，cursor 为 null");
            }
        } catch (Exception e) {
            addLog("读取短信失败: " + e.getMessage(), true);
            e.printStackTrace();
        }
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
        if (smsObserver != null) {
            getContentResolver().unregisterContentObserver(smsObserver);
        }
    }
}
