package io.github.tdmb102026.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

// Widget del panel: un botón de micrófono que escucha y anota sin abrir la app.
public class WidgetVoz extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        Intent i = new Intent(ctx, VozActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        for (int id : ids) {
            RemoteViews vista = new RemoteViews(ctx.getPackageName(), R.layout.widget_voz);
            vista.setOnClickPendingIntent(R.id.mic, pi);
            manager.updateAppWidget(id, vista);
        }
    }
}
