# Anotar por voz: servidor de la IA

Dices "gasté 30 en el súper" y la app lo anota sola. La frase va a un servidor tuyo en Google (Apps Script),
que revisa la contraseña de la app y se la pasa a Claude (Anthropic) con **tu** clave de API.
La clave nunca llega al celular ni a este repositorio.

## Preparar el servidor (una sola vez, unos 10 minutos)

1. **Clave nueva.** Entra a https://console.anthropic.com → **API Keys** → *Create Key*. Nómbrala
   **Finanzas voz** (no reuses la del Despacho). Cópiala y no la pegues en ningún chat.
   El saldo es el mismo de siempre (Billing). Cada frase cuesta unos 0,01 centavos de dólar: 10.000 frases ≈ 1 dólar.
2. **Hoja nueva.** En Google Drive crea una hoja de cálculo, por ejemplo «Finanzas voz».
3. Menú **Extensiones → Apps Script**. Borra lo que haya, pega todo `finanzas-ia.gs` y guarda (ícono del disquete).
4. **Implementar → Nueva implementación → tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso:
   **Cualquier persona**. Implementar, autorizar con tu cuenta y copiar el enlace que termina en `/exec`.
5. Vuelve a la hoja y recárgala: aparece el menú **Finanzas IA**.
   - **Guardar clave de Anthropic**: pega la clave del paso 1.
   - **Guardar contraseña de la app**: inventa una contraseña (6 letras o más).
6. **En el celular:** abre la app → **Proyección** → baja a **Anotar por voz**. Pega el enlace `/exec`, escribe la
   contraseña y toca **Guardar y probar**. Debe decir "Listo".

## Usarlo

- **Widget del micrófono (app Android):** escucha y anota sin abrir la app; avisa "Anotado…" y se cierra.
- En **Anotar**, toca **🎤 Anotar por voz** y habla. Al terminar de hablar se anota solo.
- Lo que corriges en **Por revisar** se le manda a la IA como ejemplo, así aprende cómo clasificas tus gastos.
- **Acceso directo:** mantén presionado el ícono de la app en la pantalla principal → **Anotar por voz**.
  (Si no aparece, quita la app de la pantalla principal y vuelve a agregarla desde Chrome.)
- También puedes escribir la frase o usar el micrófono del teclado.
- Si la IA duda, o no hay internet, la frase queda en **Movimientos → Por revisar** (con un número rojo).
  Sin internet se ordena sola cuando vuelve la señal. Los pendientes no cuentan en el Resumen hasta confirmarlos.

## La pestaña «Voz»

Cada frase queda anotada en la hoja, en la pestaña «Voz»: fecha, frase, lo que entendió la IA y los tokens usados.
Sirve para ver si la IA se equivoca y cuánto gasta.

## Si cambias el script

Usa **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión**. Así el enlace no cambia.

## Modelo

`MODELO` al inicio del script. Por defecto `claude-haiku-5-5` (el más barato). Si entiende mal las frases, cambiarlo a
`claude-sonnet-5-5` (unos 20 veces más caro, igual menos de un centavo por frase) y publicar una nueva versión.
