package io.github.tdmb102026.finanzas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.ArrayList;

// Abre la app web de Finanzas por dentro y le da lo que el navegador no tiene aquí:
// el reconocimiento de voz de Google y guardar el Excel en Descargas.
public class MainActivity extends Activity {
    static final String URL = "https://tdmb102026.github.io/finanzas-voz/";
    static final String VOZ = "io.github.tdmb102026.finanzas.VOZ";
    private static final int PEDIR_VOZ = 1;

    private WebView web;
    private boolean cargada = false;
    private boolean vozPendiente = false;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        web.addJavascriptInterface(new Puente(), "AndroidVoz");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if ("tdmb102026.github.io".equals(u.getHost()) && u.getPath() != null
                        && u.getPath().startsWith("/finanzas-voz")) return false;
                // Enlaces de afuera (GitHub, la consola de Claude…) se abren en el navegador.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                cargada = true;
                if (vozPendiente) {
                    vozPendiente = false;
                    escucharEnPagina();
                }
            }
        });
        // El WebView va dentro de un marco: Android 15 dibuja la app debajo de la barra de la hora
        // y de la de gestos, y el marco deja ese espacio libre (y el del teclado) para que nada quede tapado.
        FrameLayout marco = new FrameLayout(this);
        marco.addView(web);
        setContentView(marco);
        if (Build.VERSION.SDK_INT >= 30) {
            marco.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        vozPendiente = esVoz(getIntent());
        if (guardado != null) web.restoreState(guardado);
        else web.loadUrl(URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!esVoz(intent)) return;
        if (cargada) escucharEnPagina();
        else vozPendiente = true;
    }

    private static boolean esVoz(Intent i) {
        return i != null && VOZ.equals(i.getAction());
    }

    // La página revisa que la voz esté configurada y llama de vuelta a Puente.escuchar().
    private void escucharEnPagina() {
        web.evaluateJavascript("window.Voz && Voz.escuchar()", null);
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        if (pedido != PEDIR_VOZ || resultado != RESULT_OK || datos == null) return;
        ArrayList<String> textos = datos.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (textos == null || textos.isEmpty()) return;
        web.evaluateJavascript("Voz.oido(" + JSONObject.quote(textos.get(0)) + ")", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // Funciones que la página puede llamar como AndroidVoz.escuchar() y AndroidVoz.guardar(...).
    class Puente {
        @JavascriptInterface
        public void escuchar() {
            runOnUiThread(() -> {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-EC");
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "¿Qué gastaste o cobraste?");
                try {
                    startActivityForResult(i, PEDIR_VOZ);
                } catch (ActivityNotFoundException e) {
                    web.evaluateJavascript("Voz.sinVozNativa()", null);
                }
            });
        }

        @JavascriptInterface
        public void guardar(String base64, String nombre, String tipo) {
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
                v.put(MediaStore.Downloads.MIME_TYPE, tipo);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                try (OutputStream o = getContentResolver().openOutputStream(uri)) {
                    o.write(Base64.decode(base64, Base64.DEFAULT));
                }
                aviso("Guardado en Descargas: " + nombre);
            } catch (Exception e) {
                aviso("No se pudo guardar el archivo");
            }
        }

        private void aviso(String texto) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, texto, Toast.LENGTH_LONG).show());
        }
    }
}
