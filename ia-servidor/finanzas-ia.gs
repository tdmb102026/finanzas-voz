// Servidor de la IA para «Finanzas en 3 segundos» (anotar por voz).
// La app manda la frase dicha ("gasté 30 en el súper") y la lista de conceptos; aquí se revisa la
// contraseña de la app, se le pide a Claude (Anthropic) que la convierta en movimientos y se devuelven.
// La clave de API nunca sale de aquí: el celular solo conoce la contraseña de la app.
// Se pega en Extensiones → Apps Script de una hoja nueva y se implementa como "Aplicación web"
// (ejecutar como: yo; acceso: cualquier persona). Los pasos están en ia-servidor/LEEME.md.

// Haiku: el más barato (unos 0,01 centavos de dólar por frase). Si entiende mal, cambiar a "claude-sonnet-5-5".
const MODELO = "claude-haiku-5-5";
const HOJA = "Voz";
const TITULOS = ["Fecha", "Frase", "Resultado", "Tokens entrada", "Tokens salida"];
// Precio de Haiku 5.5 en dólares por millón de tokens (entrada, salida), para la pestaña «Uso».
const PRECIO = [0.10, 0.50];

// ---------- menú de la hoja ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Finanzas IA")
    .addItem("Guardar clave de Anthropic", "guardarClaveAnthropic")
    .addItem("Guardar contraseña de la app", "guardarContrasena")
    .addItem("Agregar otra persona", "agregarPersona")
    .addToUi();
}
function guardarClaveAnthropic() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Clave de API de Anthropic", "Pega la clave «Finanzas voz» (empieza con sk-ant-). Queda guardada en el script, no en la hoja.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = r.getResponseText().trim();
  if (!/^sk-ant-/.test(k)) return ui.alert("Esa no parece una clave de Anthropic (debe empezar con sk-ant-).");
  PropertiesService.getScriptProperties().setProperty("ANTHROPIC_API_KEY", k);
  ui.alert("Clave guardada.");
}
function guardarContrasena() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Contraseña de la app", "Invéntala (por ejemplo una frase corta). La escribirás una vez en la app, en Proyección → Anotar por voz.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = r.getResponseText().trim();
  if (k.length < 6) return ui.alert("Usa al menos 6 letras o números.");
  PropertiesService.getScriptProperties().setProperty("APP_CLAVE", k);
  ui.alert("Contraseña guardada.");
}

// Otra persona con su propia contraseña: sus frases van a su pestaña «Voz Nombre».
function agregarPersona() {
  const ui = SpreadsheetApp.getUi();
  const n = ui.prompt("Agregar persona", "¿Cómo se llama? (por ejemplo Juan)", ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  const nombre = n.getResponseText().trim().replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g, "").slice(0, 30);
  if (!nombre) return ui.alert("Escribe un nombre.");
  const r = ui.prompt("Contraseña de " + nombre, "Invéntale una contraseña distinta a la tuya. La escribirá en su app, en Proyección → Anotar por voz.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = r.getResponseText().trim();
  if (k.length < 6) return ui.alert("Usa al menos 6 letras o números.");
  const props = PropertiesService.getScriptProperties();
  const personas = personas_();
  if (k === props.getProperty("APP_CLAVE") || Object.keys(personas).some(x => personas[x] === k && x !== nombre)) {
    return ui.alert("Esa contraseña ya la usa otra persona. Elige otra.");
  }
  personas[nombre] = k;
  props.setProperty("PERSONAS", JSON.stringify(personas));
  hojaDe_(nombre);
  ui.alert(nombre + " agregado. Sus frases se verán en la pestaña «Voz " + nombre + "» y el resumen en «Uso».");
}
function personas_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("PERSONAS") || "{}"); } catch (e) { return {}; }
}
// Quién manda la frase según la contraseña: "" es el dueño (pestaña «Voz»), null si no es de nadie.
function quien_(clave) {
  if (!clave) return null;
  if (clave === PropertiesService.getScriptProperties().getProperty("APP_CLAVE")) return "";
  const personas = personas_();
  return Object.keys(personas).find(n => personas[n] === clave) ?? null;
}

// La pestaña de cada persona, y su fila en «Uso» con fórmulas que cuentan frases y costo.
function hojaDe_(persona) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nombre = persona ? HOJA + " " + persona : HOJA;
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.appendRow(TITULOS); h.setFrozenRows(1); h.getRange(1, 1, 1, TITULOS.length).setFontWeight("bold");
  }
  let uso = ss.getSheetByName("Uso");
  if (!uso) {
    uso = ss.insertSheet("Uso");
    uso.appendRow(["Persona", "Frases", "Tokens entrada", "Tokens salida", "Costo aprox. ($)", "Costo por frase ($)"]);
    uso.setFrozenRows(1); uso.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  const quien = persona || "Yo";
  const filas = uso.getRange(1, 1, uso.getLastRow(), 1).getValues().map(f => f[0]);
  if (!filas.includes(quien)) {
    const r = uso.getLastRow() + 1, t = "'" + nombre + "'!";
    uso.getRange(r, 1).setValue(quien);
    uso.getRange(r, 2, 1, 5).setFormulas([[
      "=COUNTA(" + t + "B2:B)",
      "=SUM(" + t + "D2:D)",
      "=SUM(" + t + "E2:E)",
      "=ROUND(C" + r + "*" + PRECIO[0] + "/1000000+D" + r + "*" + PRECIO[1] + "/1000000, 4)",
      "=IF(B" + r + ">0, ROUND(E" + r + "/B" + r + ", 5), 0)",
    ]]);
  }
  return h;
}

// Cada frase queda anotada en la pestaña de quien la dijo: sirve para ver qué entendió la IA y cuánto gasta.
function anotarHoja_(persona, frase, resultado, uso) {
  try {
    hojaDe_(persona).appendRow([new Date(), frase, JSON.stringify(resultado), (uso || {}).input_tokens || 0, (uso || {}).output_tokens || 0]);
  } catch (err) { /* si la hoja falla, la respuesta a la app sigue */ }
}

// ---------- lo que se le pide a la IA ----------
const SISTEMA = `Conviertes frases dichas en voz alta, en español de Ecuador, en movimientos de dinero de una app de finanzas personales.
La moneda es siempre el dólar. "1.50", "uno cincuenta", "un dólar con cincuenta" y "dólar cincuenta" son 1.50; "veinte" es 20; "medio" es 0.50; "un millón" es 1000000.
La frase viene de un dictado por voz: puede traer errores de transcripción. Interprétala con sentido común, pero no inventes datos.
Reglas:
- Una frase puede traer varios movimientos ("30 en el súper y 10 de gasolina"): devuelve uno por cada monto.
- concepto: el id de la lista que mejor encaje. Ejemplos: súper, mercado o víveres → despensa; almuerzo, restaurante,
  cualquier comida o bebida (colada morada, encebollado, bolón, fritada, café, jugo, cola) → comidas; luz eléctrica → luz.
  Si ningún concepto encaja (por ejemplo un juguete, un regalo o algo suelto), usa el concepto llamado "Otros"
  del mismo tipo si existe, con seguro en true si el monto está claro. Si no hay "Otros", elige el más cercano y pon seguro en false.
- Si hay "ejemplos corregidos por la persona", síguelos: muestran cómo clasifica ella sus gastos.
- monto: el número en dólares. Si la frase no dice un monto, pon 0 y seguro en false.
- dias_atras: 0 si es de hoy o no lo dice; 1 si dice "ayer"; 2 si dice "anteayer"; para un día de la semana, cuántos días han pasado desde ese día.
- nota: un detalle útil de la frase que no sea el monto ni el concepto (por ejemplo "almuerzo con Ana"), o "" si no hay.
- seguro: true si el monto está claro y el concepto elegido es razonable, aunque la palabra exacta no esté en la lista
  (por ejemplo, una comida típica → comidas). false solo si falta el monto o si dudas entre conceptos muy distintos.
- Si la frase no es un gasto, ingreso o inversión (por ejemplo "hola" o "pagué lo de siempre"), devuelve la lista vacía.`;

function esquema_(ids) {
  const obj = props => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
  return obj({
    movimientos: { type: "array", items: obj({
      concepto: { type: "string", enum: ids },
      monto: { type: "number", description: "Dólares, con centavos si los hay" },
      dias_atras: { type: "integer" },
      nota: { type: "string" },
      seguro: { type: "boolean" },
    }) },
  });
}

// La app manda [{id, nombre, tipo, categoria}]; se limpia por si acaso.
function conceptos_(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 200).map(c => ({
    id: String(c.id || "").slice(0, 60), nombre: String(c.nombre || "").slice(0, 60),
    tipo: String(c.tipo || "").slice(0, 20), categoria: String(c.categoria || "").slice(0, 60),
  })).filter(c => c.id);
}

// Llamada a la API de Claude (Apps Script no tiene SDK de Anthropic: va por HTTP).
// Esfuerzo bajo: es una tarea corta y la respuesta tiene que llegar en un par de segundos.
// Frases que la persona corrigió en la app: [{frase, concepto, monto}].
function ejemplos_(lista, ids) {
  return (Array.isArray(lista) ? lista : []).slice(-30)
    .filter(x => x && ids.indexOf(String(x.concepto)) >= 0)
    .map(x => `«${String(x.frase || "").slice(0, 200)}» → ${x.concepto}, ${Number(x.monto) || 0}`);
}

function claude_(frase, conceptos, hoy, ejemplos) {
  const key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, error: "sin-clave-api" };
  const lista = conceptos.map(c => `${c.id} | ${c.nombre} | ${c.tipo} | ${c.categoria}`).join("\n");
  const cuerpo = {
    model: MODELO, max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: esquema_(conceptos.map(c => c.id)) } },
    system: SISTEMA,
    messages: [{ role: "user", content: `Conceptos (id | nombre | tipo | categoría):\n${lista}\n\n`
      + (ejemplos.length ? `Ejemplos corregidos por la persona:\n${ejemplos.join("\n")}\n\n` : "")
      + `Hoy es ${hoy}.\nFrase: «${frase}»` }],
  };
  const r = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": key, "anthropic-version": "2026-10-21" },
    payload: JSON.stringify(cuerpo),
  });
  const code = r.getResponseCode(), j = JSON.parse(r.getContentText() || "{}");
  if (code === 401 || code === 403) return { ok: false, error: "clave-api" };
  if (code === 429 || /credit|balance/i.test(((j.error || {}).message) || "")) return { ok: false, error: "saldo" };
  if (code !== 200) return { ok: false, error: "api", detalle: code + " " + ((j.error || {}).message || "") };
  if (j.stop_reason === "refusal") return { ok: false, error: "rechazo" };
  const t = (j.content || []).filter(b => b.type === "text")[0];
  if (!t) return { ok: false, error: "vacio" };
  return { ok: true, movimientos: JSON.parse(t.text).movimientos || [], uso: j.usage };
}

// ---------- aplicación web ----------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, servicio: "finanzas-ia" }); }
// El celular manda { clave, tipo: "probar" | "frase", frase, hoy: "lunes 2026-10-26", conceptos }
function doPost(e) {
  try {
    const q = JSON.parse(e.postData.contents);
    const persona = quien_(String(q.clave || ""));
    if (persona === null) return json_({ ok: false, error: "contraseña" });
    if (q.tipo === "probar") return json_({ ok: true });
    const frase = String(q.frase || "").trim().slice(0, 500);
    const conceptos = conceptos_(q.conceptos);
    if (!frase || !conceptos.length) return json_({ ok: false, error: "pedido" });
    const r = claude_(frase, conceptos, String(q.hoy || "").slice(0, 40), ejemplos_(q.ejemplos, conceptos.map(c => c.id)));
    anotarHoja_(persona, frase, r.ok ? r.movimientos : r, r.uso);
    delete r.uso;
    return json_(r);
  } catch (err) {
    return json_({ ok: false, error: "servidor", detalle: String(err) });
  }
}
