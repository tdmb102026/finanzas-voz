# Notas para Claude

- Dueño: fer (GitHub `tdmb102026`). Escribe en español; responde en español sencillo.
- fer autorizó (2026-10-26) que Claude mezcle sus propios PRs en este repo después de probarlos, sin esperar su aprobación.
- App web estática (HTML, CSS y JavaScript sin librerías), publicada con GitHub Pages desde `main` / root.
- Montos en centavos de dólar; solo USD.
- Cada vez que cambie un archivo de la app, subir `VERSION` en `sw.js` para que los celulares reciban la versión nueva.
- fer prueba desde su celular Android en `https://tdmb102026.github.io/finanzas-voz/`.
- Voz (fase 2): app → Apps Script `ia-servidor/finanzas-ia.gs` (guarda la clave de Anthropic y la contraseña de la app en las propiedades del script) → Claude Haiku 5.5 con salida JSON. Nunca poner claves en el repo ni pedirlas en el chat. Este entorno no llega a script.google.com: fer prueba en su celular.
- Movimientos con `estado: 'pendiente'` (frase por revisar) no cuentan en totales, gráficos ni exportación.
