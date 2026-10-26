# Notas para Claude

- Dueño: fer (GitHub `tdmb102026`). Escribe en español; responde en español sencillo.
- fer autorizó (2026-10-26) que Claude mezcle sus propios PRs en este repo después de probarlos, sin esperar su aprobación.
- App web estática (HTML, CSS y JavaScript sin librerías), publicada con GitHub Pages desde `main` / root.
- Montos en centavos de dólar; solo USD.
- Cada vez que cambie un archivo de la app, subir `VERSION` en `sw.js` para que los celulares reciban la versión nueva.
- fer prueba desde su celular Android en `https://tdmb102026.github.io/finanzas-voz/`.
- Voz (fase 2): app → Apps Script `ia-servidor/finanzas-ia.gs` (guarda la clave de Anthropic y la contraseña de la app en las propiedades del script) → Claude Haiku 5.5 con salida JSON. Nunca poner claves en el repo ni pedirlas en el chat. Este entorno no llega a script.google.com: fer prueba en su celular.
- Movimientos con `estado: 'pendiente'` (frase por revisar) no cuentan en totales, gráficos ni exportación.
- App Android (`android/`, Java sin librerías): WebView de la app web + widget de micrófono + `RecognizerIntent` (la voz web no funciona en WebView) + guardar en Descargas. Puente JS `window.AndroidVoz` (`escuchar`, `guardar`, `resultado`); la página responde con `Voz.oido(texto)`. El widget y el atajo abren `VozActivity`: pantalla invisible con un WebView oculto que escucha, anota y se cierra con un aviso, sin mostrar la app. Se compila solo en GitHub Actions (aquí no se puede: dl.google.com está bloqueado) y se publica en la release `apk`. Firma con `android/app/debug.keystore` (clave de depuración pública) para que las actualizaciones se instalen encima.
- El celular de fer dejó de instalar apps web desde Chrome (2026-10-26; en otro celular sí funciona): por eso la app Android.
- Cambios en `ia-servidor/finanzas-ia.gs` no se aplican solos: fer debe pegar el código nuevo en su Apps Script y publicar una versión nueva (Implementar → Gestionar implementaciones → editar → Nueva versión). Avisarle cada vez.
- Lo que fer corrige en "Por revisar" se guarda como ejemplo (`voz-ejemplos`, últimos 30) y se manda a la IA en cada frase.
