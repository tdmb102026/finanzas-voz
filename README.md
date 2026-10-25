# Finanzas en 3 segundos

App para anotar gastos e ingresos en 3 segundos o menos. Funciona en el celular como app web instalable, sin internet, y guarda todo en el teléfono.

## Fase 1: anotar con teclado (esta versión)

- **Anotar:** escribe el monto y toca una categoría; eso guarda. Gasto por defecto, Ingreso a un toque. Aparece "Deshacer" por 4 segundos.
- **Movimientos:** lista del mes con ingresos, gastos y saldo. Toca un movimiento para corregirlo o borrarlo.
- **Medición:** al pie de Movimientos se ve cuánto tardas en promedio en anotar y cuántos registros salieron en 3 s o menos.

Meta de la fase: anotar todo durante 7 días seguidos, cada registro en 3 segundos o menos.

## Cómo probarla

1. En GitHub: **Settings → Pages → Branch: `main` / root → Save**.
2. Abre `https://tdmb102026.github.io/finanzas-voz/` en Chrome del celular.
3. Menú ⋮ → **Agregar a la pantalla principal**. Desde ahí abre como app y funciona sin internet.

En la computadora: `python3 -m http.server` dentro de la carpeta y abre `http://localhost:8000`.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Las pantallas |
| `app.js` | Lógica: teclado, categorías, lista, editor |
| `db.js` | Guardado en el teléfono (IndexedDB) |
| `sw.js` | Hace que la app abra sin internet. Sube `VERSION` cuando cambies un archivo |
| `styles.css` | Estilos, con modo oscuro |

Los montos se guardan en centavos de dólar (`1.50` → `150`).

## Próximas fases

2. Anotar por voz (Apps Script + Claude Haiku 5.5).
3. Resumen del mes, exportar a CSV y respaldo en una hoja de Google.
4. App nativa, solo si la fase 3 funciona con personas reales.
