package io.github.tdmb102026.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// Widget del panel: un botón de micrófono que escucha y anota sin abrir la app.
// Cada widget es de Personal o de un negocio (se elige al ponerlo); el del negocio muestra su nombre
// y lo que se dice ahí se anota en ese negocio.
public class WidgetVoz extends AppWidgetProvider {
    static final String FIJADO = "io.github.tdmb102026.finanzas.WIDGET_FIJADO";
    static final String NEGOCIO = "negocio";

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("app", Context.MODE_PRIVATE);
    }

    // Negocio del widget: "" = personal.
    static String negocioDe(Context ctx, int id) {
        return prefs(ctx).getString("widget-" + id, "");
    }

    static void elegir(Context ctx, int id, String negocio) {
        prefs(ctx).edit().putString("widget-" + id, negocio == null ? "" : negocio).apply();
        dibujar(ctx, AppWidgetManager.getInstance(ctx), id);
    }

    // Lista de negocios que guarda la página: [{id, nombre, icono}].
    static JSONArray negocios(Context ctx) {
        try { return new JSONArray(prefs(ctx).getString("negocios", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    // "🚗 Carros RC", o null si es personal o el negocio ya no existe.
    static String nombre(Context ctx, String negocio) {
        if (negocio == null || negocio.isEmpty()) return null;
        JSONArray l = negocios(ctx);
        for (int i = 0; i < l.length(); i++) {
            JSONObject n = l.optJSONObject(i);
            if (n != null && negocio.equals(n.optString("id"))) return (n.optString("icono") + " " + n.optString("nombre")).trim();
        }
        return null;
    }

    static void dibujar(Context ctx, AppWidgetManager manager, int id) {
        String negocio = negocioDe(ctx, id);
        String nombre = nombre(ctx, negocio);
        if (nombre == null) negocio = "";
        Intent i = new Intent(ctx, VozActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(NEGOCIO, negocio)
                // Un dato distinto por widget, para que Android no junte los de varios negocios en uno.
                .setData(Uri.parse("finanzas://widget/" + id));
        PendingIntent pi = PendingIntent.getActivity(ctx, id, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        RemoteViews vista = new RemoteViews(ctx.getPackageName(), R.layout.widget_voz);
        vista.setOnClickPendingIntent(R.id.mic, pi);
        vista.setOnClickPendingIntent(R.id.nombre, pi);
        vista.setTextViewText(R.id.nombre, nombre == null ? "" : nombre);
        vista.setViewVisibility(R.id.nombre, nombre == null ? View.GONE : View.VISIBLE);
        manager.updateAppWidget(id, vista);
    }

    static void dibujarTodos(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, WidgetVoz.class))) dibujar(ctx, m, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) dibujar(ctx, manager, id);
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (int id : ids) e.remove("widget-" + id);
        e.apply();
    }

    // Widget puesto desde la app ("Poner widget en la pantalla"): Android avisa aquí con su número.
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (FIJADO.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) elegir(ctx, id, intent.getStringExtra(NEGOCIO));
            return;
        }
        super.onReceive(ctx, intent);
    }
}
