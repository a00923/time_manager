package com.timemanager.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public class TaskWidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "widget_data";
    public static final String KEY_TODAY_TASKS = "today_tasks";
    public static final String ACTION_START_TIMER = "com.timemanager.app.START_TIMER";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_task);

        // 标题点击打开应用
        Intent mainIntent = new Intent(context, MainActivity.class);
        mainIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent mainPi = PendingIntent.getActivity(context, 0, mainIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_header, mainPi);

        // 读取今日任务
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String tasksJson = prefs.getString(KEY_TODAY_TASKS, "[]");

        try {
            JSONArray tasks = new JSONArray(tasksJson);
            int maxShow = 5;
            int[] titleIds = {R.id.task_title_1, R.id.task_title_2, R.id.task_title_3, R.id.task_title_4, R.id.task_title_5};
            int[] metaIds = {R.id.task_meta_1, R.id.task_meta_2, R.id.task_meta_3, R.id.task_meta_4, R.id.task_meta_5};
            int[] barIds = {R.id.task_bar_1, R.id.task_bar_2, R.id.task_bar_3, R.id.task_bar_4, R.id.task_bar_5};
            int[] itemIds = {R.id.task_item_1, R.id.task_item_2, R.id.task_item_3, R.id.task_item_4, R.id.task_item_5};

            int showCount = Math.min(tasks.length(), maxShow);

            for (int i = 0; i < maxShow; i++) {
                if (i < showCount) {
                    JSONObject task = tasks.getJSONObject(i);
                    String title = task.optString("title", "未命名");
                    String catName = task.optString("categoryName", "");
                    String catColor = task.optString("categoryColor", "#007AFF");
                    String catId = task.optString("categoryId", "");
                    String actName = task.optString("activity", "");

                    views.setTextViewText(titleIds[i], title);
                    views.setTextViewText(metaIds[i], catName);
                    views.setInt(barIds[i], "setBackgroundColor", android.graphics.Color.parseColor(catColor));
                    views.setViewVisibility(itemIds[i], android.view.View.VISIBLE);

                    // 点击进入计时
                    Intent timerIntent = new Intent(context, MainActivity.class);
                    timerIntent.setAction(ACTION_START_TIMER);
                    timerIntent.putExtra("categoryId", catId);
                    timerIntent.putExtra("activity", actName);
                    timerIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    PendingIntent timerPi = PendingIntent.getActivity(context, i * 100 + 1, timerIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(itemIds[i], timerPi);
                } else {
                    views.setViewVisibility(itemIds[i], android.view.View.GONE);
                }
            }

            // 底部提示
            if (tasks.length() > maxShow) {
                views.setTextViewText(R.id.widget_more, "还有 " + (tasks.length() - maxShow) + " 项...");
                views.setViewVisibility(R.id.widget_more, android.view.View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.widget_more, android.view.View.GONE);
            }

            // 空状态
            if (tasks.length() == 0) {
                views.setTextViewText(R.id.widget_empty, "今日暂无任务");
                views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.widget_empty, android.view.View.GONE);
            }

        } catch (Exception e) {
            views.setTextViewText(R.id.widget_empty, "数据加载失败");
            views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
            for (int i = 0; i < 5; i++) {
                int[] itemIds = {R.id.task_item_1, R.id.task_item_2, R.id.task_item_3, R.id.task_item_4, R.id.task_item_5};
                views.setViewVisibility(itemIds[i], android.view.View.GONE);
            }
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, TaskWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) {
            updateAppWidget(context, manager, id);
        }
    }
}
