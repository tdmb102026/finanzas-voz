# Finanzas en 3 segundos

App para anotar gastos e ingresos en 3 segundos o menos. Funciona en el celular como app web instalable, sin internet, y guarda todo en el teléfono.

## Qué hace

Funciona como el Excel de fer (registros + dashboard), pero se anota desde el celular en 3 segundos.

- **Anotar:** elige Gasto, Ingreso o Inversión, escribe el monto y toca el concepto (Comidas, Luz, Gasolina…); eso guarda. Cada concepto pertenece a una categoría: Gastos y Servicios (gasto); Sueldo, Negocio y Otros (ingreso); Ahorro e Inversiones (inversión). Los conceptos más usados salen primero. "Deshacer" por 4 segundos.
- **Movimientos:** lista del mes; toca uno para corregirlo o borrarlo. Al pie, cuánto tardas en promedio en anotar.
- **Resumen:** como el Dashboard del Excel. Ingresos − Gastos − Inversión = Libre, contra el presupuesto, y el % del ingreso que se invierte; cada categoría con su barra de avance y sus conceptos; distribución de egresos por categoría.
- **Ajustes:** crear o editar conceptos, su categoría y su presupuesto mensual (se repite cada mes). Exportar todo a un `.xlsx` con las columnas del Excel: Fecha, Mes, Tipo, Categoria, Concepto, Presupuesto, Monto, Nota. El presupuesto sale como una fila por concepto el día 1 de cada mes, igual que en el Excel.

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
| `db.js` | Guardado en el teléfono (IndexedDB) y conceptos iniciales del Excel |
| `excel.js` | Crea el archivo `.xlsx` para exportar, sin librerías |
| `sw.js` | Hace que la app abra sin internet. Sube `VERSION` cuando cambies un archivo |
| `styles.css` | Estilos, con modo oscuro |

Los montos se guardan en centavos de dólar (`1.50` → `150`).

## Próximas fases

2. Anotar por voz (Apps Script + Claude Haiku 5.5).
3. Respaldo en una hoja de Google.
4. App nativa, solo si la fase 3 funciona con personas reales.
