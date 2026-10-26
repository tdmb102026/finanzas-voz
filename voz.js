// Anotar por voz: la frase se guarda al instante como pendiente y la IA (Apps Script + Claude)
// la convierte en movimientos. Sin internet, o si la IA duda, queda en Movimientos → Por revisar.
// Usa lo de app.js: estado, DB, avisar, concepto, dinero, fechaLocal, aCentavos, nuevoId, repintar.
const Voz = (() => {
  // Dentro de la app Android (carpeta android/) se usa el reconocimiento de voz de Google del teléfono:
  // el de la página no funciona ahí.
  const nativo = window.AndroidVoz;
  const Reconocer = nativo ? null : window.SpeechRecognition || window.webkitSpeechRecognition;
  const ESPERA_MS = 25000;
  const ERRORES = {
    'contraseña': 'La contraseña de la voz no coincide. Revísala en Proyección → Anotar por voz.',
    'sin-clave-api': 'Falta guardar la clave de Anthropic en el Apps Script.',
    'clave-api': 'La clave de Anthropic no funciona. Crea otra y guárdala en el Apps Script.',
    saldo: 'Se acabó el saldo de la IA. Carga créditos en la consola de Claude.',
  };

  // ---------- Ajustes (solo en este teléfono) ----------

  function leer(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
  function escribir(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
  // Enlace de la aplicación web del Apps Script de fer (no es secreto: lo protege la contraseña).
  // Se puede cambiar en Proyección → Anotar por voz.
  const URL_SERVIDOR = 'https://script.google.com/macros/s/AKfycbyxXIiCCKmZjdPKsmFEwgZ1oJ7UbtJdPVGMVc4YiX9p902HJTnkTxjFdnUjIivYgxo8Lw/exec';
  const ajustes = () => ({ url: leer('voz-url') || URL_SERVIDOR, clave: leer('voz-clave') });
  const configurada = () => { const a = ajustes(); return !!(a.url && a.clave); };

  async function llamar(cuerpo, a = ajustes()) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ESPERA_MS);
    try {
      // text/plain para que Apps Script lo acepte sin permiso previo (CORS).
      const r = await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ clave: a.clave, ...cuerpo }), signal: ctl.signal });
      return await r.json();
    } catch {
      return { ok: false, error: 'sin-red' };
    } finally {
      clearTimeout(t);
    }
  }

  function pintarAjustes() {
    const f = $('voz-form');
    const a = ajustes();
    f.url.value = a.url;
    f.clave.value = a.clave;
    $('voz-estado').textContent = configurada() ? 'Lista en este teléfono.' : 'Escribe la contraseña de la app y toca Guardar y probar.';
  }

  async function guardarAjustes(e) {
    e.preventDefault();
    const f = $('voz-form');
    const a = { url: f.url.value.trim(), clave: f.clave.value.trim() };
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(a.url)) {
      $('voz-estado').textContent = 'El enlace debe ser el de la aplicación web del Apps Script, termina en /exec.';
      return;
    }
    $('voz-estado').textContent = 'Probando…';
    const j = await llamar({ tipo: 'probar' }, a);
    if (!j.ok) {
      $('voz-estado').textContent = j.error === 'sin-red' ? 'No se pudo conectar. Revisa el enlace y la señal.'
        : ERRORES[j.error] || 'El servidor respondió con un error.';
      return;
    }
    escribir('voz-url', a.url);
    escribir('voz-clave', a.clave);
    $('voz-estado').textContent = 'Listo: ya puedes anotar por voz.';
    procesarPendientes();
  }

  // ---------- Escuchar ----------

  let rec = null, tocada = false;

  function escuchar() {
    if (!configurada()) {
      avisar('Primero escribe la contraseña de la voz en Proyección → Anotar por voz.');
      return;
    }
    if (nativo) { nativo.escuchar(); return; }
    abrirDialogo();
  }

  function abrirDialogo() {
    tocada = false;
    $('frase').value = '';
    $('escucha').showModal();
    if (Reconocer) empezar(); else $('frase').focus();
  }

  function empezar(idioma = 'es-EC') {
    if (rec) return;
    rec = new Reconocer();
    rec.lang = idioma;
    rec.interimResults = true;
    rec.continuous = false;
    let final = '', fallo = '';
    $('hablar').classList.add('escuchando');
    $('escucha-ayuda').textContent = 'Te escucho…';
    rec.onresult = e => {
      let parcial = '';
      final = '';
      for (const r of e.results) (r.isFinal ? (final += r[0].transcript) : (parcial += r[0].transcript));
      $('frase').value = (final + parcial).trim();
    };
    rec.onerror = e => { fallo = e.error; };
    rec.onend = () => {
      rec = null;
      $('hablar').classList.remove('escuchando');
      if (fallo === 'language-not-supported' && idioma !== 'es-ES') return empezar('es-ES');
      $('escucha-ayuda').textContent = fallo === 'not-allowed'
        ? 'Toca 🎤 para hablar (o escribe la frase).'
        : 'Toca 🎤 para volver a hablar, o corrige el texto.';
      // Lo dicho se anota solo, sin tocar nada más: así se queda en 3 segundos.
      if (final.trim() && !tocada && $('escucha').open) enviar(final.trim());
    };
    try { rec.start(); } catch { rec = null; $('hablar').classList.remove('escuchando'); }
  }

  function parar() { if (rec) rec.abort(); }

  // ---------- Anotar la frase ----------

  // Monto aproximado sin internet: el primer número de la frase.
  function montoRapido(frase) {
    const m = frase.match(/\d+(?:[.,]\d{1,2})?/);
    return (m && aCentavos(m[0])) || 0;
  }

  async function enviar(frase) {
    parar();
    $('escucha').close();
    const mov = {
      id: nuevoId(),
      tipo: 'gasto',
      monto: montoRapido(frase),
      moneda: 'USD',
      concepto: '',
      fecha: fechaLocal(),
      nota: '',
      frase,
      estado: 'pendiente',
      ia: 'falta',
      ms: null,
      creado: new Date().toISOString(),
    };
    mov.editado = mov.creado;
    await DB.guardar(mov);
    vibrar(30);
    avisar(`Anotando: «${frase}»…`);
    const r = await clasificar(mov);
    avisar(mensaje(r, frase), () => deshacerTodo(r.movs));
    repintar();
    pintarPendientes();
  }

  function mensaje(r, frase) {
    const listos = r.movs.filter(m => m.estado === 'listo');
    if (r.error === 'sin-red') return 'Sin señal: queda guardado y se ordena solo al volver el internet.';
    if (r.error) return ERRORES[r.error] || 'La IA dio un error: queda en Movimientos para revisar.';
    if (!listos.length) return `Para revisar en Movimientos: «${frase}»`;
    const m = listos[0], c = concepto(m.concepto);
    const resto = r.movs.length - 1;
    return `Anotado: ${TIPOS[m.tipo].texto} ${dinero(m.monto)}, ${c.nombre.toLowerCase()}`
      + (resto ? ` y ${resto} más` : '')
      + (listos.length < r.movs.length ? ' (revisa los pendientes)' : '');
  }

  async function deshacerTodo(movs) {
    for (const m of movs) {
      await DB.borrar(m.id);
      if (m.estado === 'listo') {
        const c = estado.conceptos.find(x => x.id === m.concepto);
        if (c) { c.usos = Math.max(0, (c.usos || 0) - 1); await DB.guardarConcepto(c); }
      }
    }
    pintarPendientes();
  }

  // Manda la frase a la IA y guarda lo que entendió. Devuelve { movs, error }.
  async function clasificar(mov) {
    const hoy = new Date(mov.fecha);
    const j = await llamar({
      tipo: 'frase',
      frase: mov.frase,
      hoy: `${DIAS[hoy.getDay()]} ${mov.fecha.slice(0, 10)}`,
      conceptos: estado.conceptos.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, categoria: c.categoria })),
    });
    if (!j.ok) {
      if (j.error !== 'sin-red') await DB.guardar({ ...mov, ia: 'error' });
      return { movs: [mov], error: j.error };
    }
    if (!j.movimientos.length) {
      const m = { ...mov, ia: 'duda' };
      await DB.guardar(m);
      return { movs: [m] };
    }
    const movs = [];
    for (const [i, x] of j.movimientos.entries()) {
      const c = estado.conceptos.find(k => k.id === x.concepto);
      const monto = Math.round(Number(x.monto) * 100) || 0;
      const fecha = new Date(hoy);
      fecha.setDate(fecha.getDate() - Math.min(Math.max(Number(x.dias_atras) || 0, 0), 60));
      const listo = !!(c && monto > 0 && x.seguro);
      const m = {
        ...mov,
        id: i === 0 ? mov.id : nuevoId(),
        tipo: c ? c.tipo : mov.tipo,
        monto: monto || mov.monto,
        concepto: c ? c.id : '',
        fecha: fechaLocal(fecha),
        nota: String(x.nota || '').slice(0, 100),
        estado: listo ? 'listo' : 'pendiente',
        ia: listo ? 'ok' : 'duda',
      };
      await DB.guardar(m);
      if (listo) { c.usos = (c.usos || 0) + 1; await DB.guardarConcepto(c); }
      movs.push(m);
    }
    return { movs };
  }

  // Las frases que no llegaron a la IA (sin señal) se mandan al volver el internet.
  let procesando = false;
  async function procesarPendientes() {
    if (procesando || !configurada() || !navigator.onLine) return;
    procesando = true;
    try {
      const faltan = (await DB.todos()).filter(m => m.estado === 'pendiente' && m.ia === 'falta' && m.frase);
      for (const m of faltan) {
        const r = await clasificar(m);
        if (r.error === 'sin-red') break;
      }
      if (faltan.length) { repintar(); pintarPendientes(); }
    } finally {
      procesando = false;
    }
  }

  // Por qué un movimiento sigue pendiente, en palabras.
  function motivo(m) {
    if (m.ia === 'falta') return configurada() ? 'Se ordena solo al volver el internet' : 'Configura la voz para ordenarlo';
    if (m.ia === 'error') return 'La IA dio un error: corrígelo a mano';
    return 'La IA no estaba segura: toca para revisar';
  }

  // ---------- Eventos ----------

  $('voz').addEventListener('click', escuchar);
  $('hablar').addEventListener('click', () => (rec ? parar() : empezar()));
  $('frase').addEventListener('input', () => { tocada = true; parar(); });
  $('escucha-form').addEventListener('submit', e => {
    if (!e.submitter || e.submitter.value !== 'anotar') { parar(); return; }
    e.preventDefault();
    const frase = $('frase').value.trim();
    if (frase) enviar(frase); else $('frase').focus();
  });
  $('escucha').addEventListener('close', parar);
  $('voz-form').addEventListener('submit', guardarAjustes);
  window.addEventListener('online', procesarPendientes);

  // Respuestas de la app Android: lo que se dijo, o que el teléfono no tiene reconocimiento de voz.
  function oido(texto) { if (texto && texto.trim()) enviar(texto.trim()); }
  function sinVozNativa() { abrirDialogo(); }

  return { escuchar, oido, sinVozNativa, procesarPendientes, pintarAjustes, motivo, configurada };
})();
