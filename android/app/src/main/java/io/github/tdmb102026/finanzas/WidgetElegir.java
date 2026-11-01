package io.github.tdmb102026.finanzas;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

// Al poner un widget nuevo: "¿Para quién es?" Personal o uno de los negocios.
// Sin negocios no pregunta nada: queda de Personal, como siempre.
public class WidgetElegir extends Activity {
    private int id = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) id = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        // Puesto desde "Poner widget de X en la pantalla": ya se sabe de quién es, no se pregunta.
        String pedido = WidgetVoz.tomarPedido(this);
        if (pedido != null) { listo(pedido); return; }
        JSONArray negocios = WidgetVoz.negocios(this);
        if (negocios.length() == 0) { listo(""); return; }

        LinearLayout lista = new LinearLayout(this);
        lista.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        lista.setPadding(pad, pad, pad, pad);
        TextView titulo = new TextView(this);
        titulo.setText("¿Para quién es este widget?");
        titulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        titulo.setPadding(0, 0, 0, dp(12));
        lista.addView(titulo);
        lista.addView(boton("🐜 Personal", ""));
        for (int i = 0; i < negocios.length(); i++) {
            JSONObject n = negocios.optJSONObject(i);
            if (n == null) continue;
            lista.addView(boton(n.optString("nombre"), n.optString("id")));
        }
        ScrollView marco = new ScrollView(this);
        marco.addView(lista);
        setContentView(marco);
    }

    private Button boton(String texto, String negocio) {
        Button b = new Button(this);
        b.setText(texto);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setOnClickListener(v -> listo(negocio));
        return b;
    }

    private void listo(String negocio) {
        WidgetVoz.elegir(this, id, negocio);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        finish();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
