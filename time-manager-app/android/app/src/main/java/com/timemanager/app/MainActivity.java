package com.timemanager.app;

import com.getcapacitor.BridgeActivity;
import android.webkit.JavascriptInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new LockTaskJS(), "AndroidLock");
        getBridge().getWebView().addJavascriptInterface(new WidgetJS(), "AndroidWidget");
        handleWidgetIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetIntent(intent);
    }

    private void handleWidgetIntent(Intent intent) {
        if (intent != null && TaskWidgetProvider.ACTION_START_TIMER.equals(intent.getAction())) {
            String categoryId = intent.getStringExtra("categoryId");
            String activity = intent.getStringExtra("activity");
            // 通过JS全局变量传递，页面加载后读取
            getBridge().getWebView().evaluateJavascript(
                "window.__widgetTimerData = {categoryId:'" + (categoryId != null ? categoryId : "") +
                "', activity:'" + (activity != null ? activity : "") + "'};", null);
        }
    }

    public class LockTaskJS {
        @JavascriptInterface
        public void start() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        startLockTask();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        stopLockTask();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }

    public class WidgetJS {
        @JavascriptInterface
        public void updateTodayTasks(String json) {
            try {
                SharedPreferences prefs = getSharedPreferences(TaskWidgetProvider.PREFS_NAME, MODE_PRIVATE);
                prefs.edit().putString(TaskWidgetProvider.KEY_TODAY_TASKS, json).apply();
                TaskWidgetProvider.updateAllWidgets(MainActivity.this);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
