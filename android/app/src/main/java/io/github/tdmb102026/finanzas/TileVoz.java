package io.github.tdmb102026.finanzas;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

// Botón del panel de arriba (junto al Wi-Fi y la linterna): se puede tocar con el celular bloqueado;
// Android pide la huella y enseguida escucha la frase con la misma pantalla invisible del widget.
public class TileVoz extends TileService {
    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setState(Tile.STATE_INACTIVE);
        t.updateTile();
    }

    @Override
    public void onClick() {
        if (isLocked()) unlockAndRun(this::escuchar);
        else escuchar();
    }

    @SuppressWarnings("deprecation")
    private void escuchar() {
        Intent i = new Intent(this, VozActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 1, i,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
