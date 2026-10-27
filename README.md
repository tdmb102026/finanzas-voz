# MIG · Hormiga$to$

Controla tus finanzas: app para anotar gastos e ingresos en 3 segundos o menos. Funciona en el celular como app web instalable, sin internet, y guarda todo en el teléfono.

## Qué hace

Funciona como el Excel de fer (registros + dashboard), pero se anota desde el celular en 3 segundos.

- **Anotar:** elige Gasto, Ingreso o Inversión, escribe el monto y toca el concepto (Comidas, Luz, Gasolina…); eso guarda. Cada concepto pertenece a una categoría: Gastos y Servicios (gasto); Sueldo, Negocio y Otros (ingreso); Ahorro e Inversiones (inversión). Los conceptos más usados salen primero. "Deshacer" por 4 segundos.
- **Anotar por voz:** toca 🎤 o usa el acceso directo del ícono y di "gasté 30 en el súper" o "ayer 10 de gasolina y 5 de almuerzo". La frase se guarda al instante y la IA (Claude Haiku, a través de tu Apps Script) la convierte en movimientos. Si duda o no hay internet, queda en Movimientos → Por revisar. Configuración en `ia-servidor/LEEME.md`.
- **Movimientos:** lista del mes; toca uno para corregirlo o borrarlo. Arriba, lo que está por revisar. Al pie, cuánto tardas en promedio en anotar.
- **Resumen:** como el Dashboard del Excel, con gráficos: dona de a dónde se fue el ingreso, curva de gastos del mes contra el presupuesto, dona de gastos por concepto y barras de los últimos 6 meses (se tocan para ver los montos). Ingresos − Gastos − Inversión = Libre, contra el presupuesto, y el % del ingreso que se invierte; cada categoría con su barra de avance y sus conceptos; distribución de egresos por categoría.
- **Proyección:** lo que esperas ganar, gastar e invertir en el mes, cómo cerrarías al ritmo actual y cuánto puedes gastar por día. Abajo, crear o editar conceptos, su categoría y su presupuesto mensual (se repite cada mes). Exportar todo a un `.xlsx` con las columnas del Excel: Fecha, Mes, Tipo, Categoria, Concepto, Presupuesto, Monto, Nota. El presupuesto sale como una fila por concepto el día 1 de cada mes, igual que en el Excel.

## Cómo probarla

1. En GitHub: **Settings → Pages → Branch: `main` / root → Save**.
2. Abre `https://tdmb102026.github.io/finanzas-voz/` en Chrome del celular.
3. Menú ⋮ → **Agregar a la pantalla principal**. Desde ahí abre como app y funciona sin internet.

En la computadora: `python3 -m http.server` dentro de la carpeta y abre `http://localhost:8000`.

## App Android (widget del micrófono)

La carpeta `android/` es una app Android pequeña que abre esta misma app por dentro y agrega lo que una app web no puede:
un **widget de micrófono** para el panel principal, el acceso directo "Anotar por voz" al mantener presionado el ícono,
el reconocimiento de voz de Google del teléfono y guardar el Excel en Descargas.

GitHub la compila sola (`.github/workflows/apk.yml`) cada vez que cambia `android/` y la deja en
https://github.com/tdmb102026/finanzas-voz/releases/download/apk/finanzas.apk. Se descarga en el celular, se abre y se instala
(Android pide permitir "instalar apps de origen desconocido" para Chrome la primera vez). Los cambios de pantallas y lógica
siguen en los archivos web: la app Android los recibe sola, sin reinstalar.

Los datos se guardan dentro de la app Android, aparte de los de Chrome.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Las pantallas |
| `app.js` | Lógica: teclado, categorías, lista, editor |
| `voz.js` | Anotar por voz: micrófono, envío al servidor y pendientes |
| `ia-servidor/` | Servidor de la IA en Apps Script (guarda la clave de Anthropic) y sus pasos |
| `db.js` | Guardado en el teléfono (IndexedDB) y conceptos iniciales del Excel |
| `graficos.js` | Gráficos del Resumen y la Proyección en SVG, sin librerías |
| `excel.js` | Crea el archivo `.xlsx` para exportar, sin librerías |
| `sw.js` | Hace que la app abra sin internet. Sube `VERSION` cuando cambies un archivo |
| `styles.css` | Estilos, con modo oscuro |

Los montos se guardan en centavos de dólar (`1.50` → `150`).

## Próximas fases

2. ~~Anotar por voz (Apps Script + Claude Haiku 5.5).~~ Hecho.
3. Respaldo en una hoja de Google.
4. App nativa, solo si la fase 3 funciona con personas reales.
