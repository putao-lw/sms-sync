package com.smsync;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";
    // 匹配4-6位数字验证码
    private static final Pattern CODE_PATTERN = Pattern.compile("(\\d{4,6})");

    public interface SmsCallback {
        void onCodeReceived(String code, String sender);
    }

    private static SmsCallback callback;

    public static void setCallback(SmsCallback cb) {
        callback = cb;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "onReceive 被调用, action: " + intent.getAction());

        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            Log.d(TAG, "忽略非 SMS_RECEIVED 广播");
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;

        String format = bundle.getString("format");

        StringBuilder fullMessage = new StringBuilder();
        String sender = "";

        for (Object pdu : pdus) {
            SmsMessage sms;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                sms = SmsMessage.createFromPdu((byte[]) pdu);
            }

            if (sender.isEmpty()) {
                sender = sms.getOriginatingAddress();
            }
            fullMessage.append(sms.getMessageBody());
        }

        String message = fullMessage.toString();
        Log.d(TAG, "收到短信: [" + sender + "] " + message);

        // 提取验证码
        String code = extractCode(message);
        if (code != null) {
            Log.d(TAG, "提取到验证码: " + code);
            if (callback != null) {
                callback.onCodeReceived(code, sender);
            }
        } else {
            Log.d(TAG, "短信中未找到验证码");
        }
    }

    private String extractCode(String message) {
        // 优先匹配包含"验证码"关键词附近的数字
        String[] keywords = {"验证码", "校验码", "动态码", "确认码", "code", "Code"};

        for (String keyword : keywords) {
            int idx = message.indexOf(keyword);
            if (idx >= 0) {
                // 在关键词附近搜索数字
                String sub = message.substring(Math.max(0, idx - 10), Math.min(message.length(), idx + 30));
                Matcher m = CODE_PATTERN.matcher(sub);
                if (m.find()) {
                    return m.group(1);
                }
            }
        }

        // 备选：匹配整个短信中的4-6位数字
        Matcher m = CODE_PATTERN.matcher(message);
        if (m.find()) {
            return m.group(1);
        }

        return null;
    }
}
