package io.github.tdmb102026.finanzas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognizerIntent;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;

// Lo que abre el widget: una pantalla invisible que escucha con el micrófono de Google,
// anota la frase con la app web (sin mostrarla) en segundo plano, avisa "Anotado…" y se cierra.
public class VozActivity extends Activity {
    private static final int PEDIR_VOZ = 1;
    private static final long ESPERA_MS = 30000;

    private WebView web;
    private boolean cargada = false;
    private String frase = null;
    private boolean terminado = false;
    private final Handler reloj = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        // La página se carga mientras la persona habla, así la frase se anota apenas termina.
        web = new WebView(this);
        web.setAlpha(0f);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        web.addJavascriptInterface(new Puente(), "AndroidVoz");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                cargada = true;
                anotarSiListo();
            }
        });
        setContentView(web);
        web.loadUrl(MainActivity.URL);

        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-EC");
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "¿Qué gastaste o cobraste?");
        try {
            startActivityForResult(i, PEDIR_VOZ);
        } catch (ActivityNotFoundException e) {
            terminar("Este teléfono no tiene reconocimiento de voz de Google.");
        }
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        if (pedido != PEDIR_VOZ) return;
        ArrayList<String> textos = resultado == RESULT_OK && datos != null
                ? datos.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
        if (textos == null || textos.isEmpty()) {
            terminar(null);
            return;
        }
        frase = textos.get(0);
        anotarSiListo();
        // La pantalla invisible se va al fondo para no tapar el celular mientras la IA responde;
        // el WebView sigue trabajando y el aviso sale igual cuando termina.
        Toast.makeText(this, "Anotando: «" + frase + "»…", Toast.LENGTH_SHORT).show();
        moveTaskToBack(true);
        // Si la página o el servidor tardan demasiado, la frase ya quedó guardada como pendiente.
        reloj.postDelayed(() -> terminar("Guardado. Si no se ordenó, está en Movimientos → Por revisar."), ESPERA_MS);
    }

    private void anotarSiListo() {
        if (!cargada || frase == null || terminado) return;
        web.evaluateJavascript("Voz.oido(" + JSONObject.quote(frase) + ")", null);
        frase = null;
    }

    private void terminar(String aviso) {
        if (terminado) return;
        terminado = true;
        reloj.removeCallbacksAndMessages(null);
        if (aviso != null) Toast.makeText(this, aviso, Toast.LENGTH_LONG).show();
        finish();
    }

    // Atrás mientras anota: se va al fondo en vez de cerrarse, para no perder la frase.
    @Override
    public void onBackPressed() {
        if (terminado) super.onBackPressed();
        else moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        reloj.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }

    class Puente {
        // Llamado por Voz.oido() cuando la frase ya se anotó (o quedó por revisar).
        @JavascriptInterface
        public void resultado(String aviso) {
            runOnUiThread(() -> terminar(aviso));
        }

        // Si la página pide escuchar (no debería pasar aquí), se ignora: ya estamos escuchando.
        @JavascriptInterface
        public void escuchar() { }
    }
}
