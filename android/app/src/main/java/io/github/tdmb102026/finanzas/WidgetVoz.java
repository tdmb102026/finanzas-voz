package io.github.tdmb102026.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// Widget del panel: un botón de micrófono que escucha y anota sin abrir la app.
// Cada widget es de Personal o de un negocio (se elige al ponerlo). El del negocio muestra su personaje
// (hormiga, oso hormiguero o león) con el nombre en una cinta dorada, y lo que se dice ahí se anota en ese negocio.
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
        prefs(ctx).edit().putString("widget-" + id, negocio == null ? "" : negocio).commit();
        dibujar(ctx, AppWidgetManager.getInstance(ctx), id);
    }

    // "Poner widget de X en la pantalla": se anota qué negocio se pidió. Algunos celulares no avisan
    // con el número del widget nuevo (o abren la pantalla de elegir), así que el primer widget sin dueño
    // que aparezca en los próximos 2 minutos queda de ese negocio.
    static void pedido(Context ctx, String negocio) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        // Los widgets que ya están puestos sin dueño guardado son de Personal: así no toman el pedido.
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, WidgetVoz.class))) {
            if (!prefs(ctx).contains("widget-" + id)) e.putString("widget-" + id, "");
        }
        e.putString("pin-negocio", negocio == null ? "" : negocio)
                .putLong("pin-hora", System.currentTimeMillis()).commit();
    }

    // El negocio pedido hace poco, o null. Se usa una sola vez.
    static String tomarPedido(Context ctx) {
        SharedPreferences p = prefs(ctx);
        long hora = p.getLong("pin-hora", 0);
        if (System.currentTimeMillis() - hora > 120000) return null;
        String n = p.getString("pin-negocio", null);
        p.edit().remove("pin-negocio").remove("pin-hora").commit();
        return n;
    }

    // Un widget recién puesto todavía no tiene dueño guardado: toma el pedido pendiente si lo hay.
    static void asignarSiNuevo(Context ctx, int id) {
        if (prefs(ctx).contains("widget-" + id)) return;
        String n = tomarPedido(ctx);
        if (n != null) prefs(ctx).edit().putString("widget-" + id, n).commit();
    }

    // Lista de negocios que guarda la página: [{id, nombre, personaje}].
    static JSONArray negocios(Context ctx) {
        try { return new JSONArray(prefs(ctx).getString("negocios", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static JSONObject buscar(Context ctx, String negocio) {
        if (negocio == null || negocio.isEmpty()) return null;
        JSONArray l = negocios(ctx);
        for (int i = 0; i < l.length(); i++) {
            JSONObject n = l.optJSONObject(i);
            if (n != null && negocio.equals(n.optString("id"))) return n;
        }
        return null;
    }

    // "Carros RC", o null si es personal o el negocio ya no existe.
    static String nombre(Context ctx, String negocio) {
        JSONObject n = buscar(ctx, negocio);
        return n == null ? null : n.optString("nombre");
    }

    static int imagenPersonaje(String personaje) {
        if ("oso".equals(personaje)) return R.drawable.negocio_oso;
        if ("leon".equals(personaje)) return R.drawable.negocio_leon;
        return R.drawable.negocio_hormiga;
    }

    // El personaje del negocio con su nombre en una cinta dorada abajo (medidas sobre 512 px).
    static Bitmap dibujo(Context ctx, String personaje, String nombre) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inScaled = false;
        Bitmap base = BitmapFactory.decodeResource(ctx.getResources(), imagenPersonaje(personaje), o);
        Bitmap b = Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawBitmap(Bitmap.createScaledBitmap(base, 512, 512, true), 0, 0, new Paint(Paint.FILTER_BITMAP_FLAG));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.parseColor("#B8860B"));
        Path cola = new Path();
        cola.moveTo(40, 400); cola.lineTo(80, 384); cola.lineTo(80, 470); cola.lineTo(40, 486); cola.close();
        cola.moveTo(472, 400); cola.lineTo(432, 384); cola.lineTo(432, 470); cola.lineTo(472, 486); cola.close();
        c.drawPath(cola, p);
        Path cinta = new Path();
        cinta.moveTo(70, 376); cinta.quadTo(256, 410, 442, 376); cinta.lineTo(442, 456);
        cinta.quadTo(256, 490, 70, 456); cinta.close();
        p.setColor(Color.parseColor("#FFD166"));
        c.drawPath(cinta, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(7);
        p.setColor(Color.parseColor("#5A3A12"));
        c.drawPath(cinta, p);
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setColor(Color.parseColor("#3E2414"));
        t.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        t.setTextAlign(Paint.Align.CENTER);
        // La letra se achica hasta que el nombre entre en la cinta.
        float tam = 60;
        t.setTextSize(tam);
        while (tam > 18 && t.measureText(nombre) > 340) { tam -= 2; t.setTextSize(tam); }
        Paint.FontMetrics fm = t.getFontMetrics();
        c.drawText(nombre, 256, 432 - (fm.ascent + fm.descent) / 2, t);
        return b;
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
        if (nombre == null) {
            vista.setImageViewResource(R.id.mic, R.drawable.widget_hormiga);
        } else {
            try {
                vista.setImageViewBitmap(R.id.mic, dibujo(ctx, buscar(ctx, negocio).optString("personaje"), nombre));
            } catch (Throwable e) {
                // Si no se pudo dibujar la cinta, al menos el personaje del negocio.
                vista.setImageViewResource(R.id.mic, imagenPersonaje(buscar(ctx, negocio).optString("personaje")));
            }
        }
        manager.updateAppWidget(id, vista);
    }

    static void dibujarTodos(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, WidgetVoz.class))) {
            asignarSiNuevo(ctx, id);
            dibujar(ctx, m, id);
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            asignarSiNuevo(ctx, id);
            dibujar(ctx, manager, id);
        }
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
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                tomarPedido(ctx);
                elegir(ctx, id, intent.getStringExtra(NEGOCIO));
            }
            return;
        }
        super.onReceive(ctx, intent);
    }
}
