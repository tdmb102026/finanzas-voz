// Negocios compartidos: lo que se anota en un negocio compartido se manda al Apps Script de fer
// (pestaña «Compartido») y se trae lo que anotaron los demás. Cada registro gana por su `_t`
// (el cambio más nuevo). El inventario se junta: se suman las líneas del historial de los dos.
const Sync = (() => {
  const CLAVE = 'compartidos'; // { idNegocio: { desde: fila, ultima: iso, personas: [nombres] } }
  const COLA = 'sync-cola';
  const TABLAS = ['negocios', 'conceptos', 'movimientos', 'inventario', 'deudas'];
  const leerJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || '') || def; } catch { return def; } };
  const escribirJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  const compartidos = () => leerJSON(CLAVE, {});
  const esCompartido = id => !!(id && compartidos()[id]);
  let yo = localStorage.getItem('sync-yo') || '';
  let enCurso = null, pendiente = false, temporizador = null, ultimoError = '';

  const negocioDe = (tabla, x) => (tabla === 'negocios' ? x.id : x.negocio || '');
  // Del inventario solo viaja lo que no sale de una venta (cada teléfono descuenta sus ventas solo).
  function paraMandar(tabla, x) {
    if (tabla !== 'inventario') return x;
    return { ...x, historial: (x.historial || []).filter(h => !h.mov || h.editado) };
  }

  function encolar(tabla, x, borrado) {
    const neg = negocioDe(tabla, x);
    if (!esCompartido(neg)) return;
    const cola = leerJSON(COLA, []).filter(c => !(c.tabla === tabla && c.id === x.id));
    cola.push({ negocio: neg, tabla, id: x.id, t: x._t || Date.now(), dato: borrado ? null : paraMandar(tabla, x) });
    escribirJSON(COLA, cola);
    programar(1500);
  }

  function encolarCombos(neg) {
    if (!esCompartido(neg)) return;
    const cola = leerJSON(COLA, []).filter(c => !(c.tabla === 'combos' && c.negocio === neg));
    cola.push({ negocio: neg, tabla: 'combos', id: 'combos-' + neg, t: Number(localStorage.getItem(`inv-combos-${neg}-t`)) || Date.now(),
      dato: Inventario.combos(neg) });
    escribirJSON(COLA, cola);
    programar(1500);
  }

  function programar(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => sincronizar(), ms);
  }

  // Junta dos versiones de un producto: datos del más nuevo, historial de los dos.
  function mezclarInventario(local, remoto, t) {
    const base = local && (local._t || 0) >= t ? local : { ...remoto, _t: t };
    const quitados = new Set([...(local?.quitados || []), ...(remoto.quitados || [])]);
    const ignorados = [...new Set([...(local?.ignorados || []), ...(remoto.ignorados || [])])];
    const hist = new Map();
    const porMov = new Map();
    const otra = base === local ? remoto : local;
    for (const h of [...(base.historial || []), ...((otra && otra.historial) || [])]) {
      if (!h.hid || quitados.has(h.hid) || hist.has(h.hid)) continue;
      if (h.mov) {
        // Una sola línea por venta; si alguien la corrigió a mano, gana esa.
        const ya = porMov.get(h.mov);
        if (ya && (ya.editado || !h.editado)) continue;
        if (ya) hist.delete(ya.hid);
        porMov.set(h.mov, h);
      }
      hist.set(h.hid, h);
    }
    const item = { ...base, historial: [...hist.values()], quitados: [...quitados], ignorados };
    item.stockActual = item.historial.reduce((a, h) => a + (h.tipo === 'compra' ? h.cantidad : -h.cantidad), item.stockInicial);
    return item;
  }

  async function aplicar(neg, cambios) {
    let hubo = false;
    for (const c of cambios) {
      if (c.tabla === 'combos') {
        const k = `inv-combos-${neg}`;
        if ((Number(localStorage.getItem(k + '-t')) || 0) < c.t) {
          localStorage.setItem(k, JSON.stringify(c.dato || []));
          localStorage.setItem(k + '-t', String(c.t));
          hubo = true;
        }
        continue;
      }
      if (!TABLAS.includes(c.tabla)) continue;
      const local = await DB.uno(c.tabla, c.id);
      if (c.dato === null) {
        if (local && (local._t || 0) <= c.t) { await DB.quitarSinAviso(c.tabla, c.id); hubo = true; }
        continue;
      }
      if (c.tabla === 'inventario') {
        const m = mezclarInventario(local, c.dato, c.t);
        if (JSON.stringify(m) !== JSON.stringify(local)) { await DB.ponerSinAviso('inventario', m); hubo = true; }
        continue;
      }
      if (local && (local._t || 0) >= c.t) continue;
      await DB.ponerSinAviso(c.tabla, { ...c.dato, _t: c.t, _quien: c.quien || c.dato._quien || '' });
      hubo = true;
    }
    return hubo;
  }

  // Manda lo pendiente y trae lo nuevo de cada negocio compartido.
  function sincronizar() {
    if (enCurso) { pendiente = true; return enCurso; }
    enCurso = (async () => {
      const lista = compartidos();
      const ids = Object.keys(lista);
      if (!ids.length || !navigator.onLine) return false;
      let cambio = false;
      for (const neg of ids) {
        const cola = leerJSON(COLA, []);
        const mios = cola.filter(c => c.negocio === neg);
        const r = await Voz.llamar({ tipo: 'sync', negocio: neg, desde: lista[neg].desde || 1,
          cambios: mios.map(c => ({ tabla: c.tabla, id: c.id, t: c.t, dato: c.dato })) });
        if (!r || !r.ok) {
          ultimoError = !r || r.error === 'sin-red' ? 'No se pudo conectar.' : r.error === 'contraseña' ? 'La contraseña no sirve en este servidor.'
            : 'El Apps Script no tiene la parte de compartir: hay que pegar el código nuevo.';
          continue;
        }
        ultimoError = '';
        if (r.yo) { yo = r.yo; localStorage.setItem('sync-yo', yo); }
        // Lo mandado ya está: se saca de la cola (si no cambió de nuevo mientras tanto).
        const enviados = new Set(mios.map(c => `${c.tabla}|${c.id}|${c.t}`));
        escribirJSON(COLA, leerJSON(COLA, []).filter(c => !enviados.has(`${c.tabla}|${c.id}|${c.t}`)));
        if (await aplicar(neg, r.cambios || [])) cambio = true;
        const ahora = compartidos();
        if (!ahora[neg]) continue;
        const personas = new Set(ahora[neg].personas || []);
        for (const c of r.cambios || []) if (c.quien) personas.add(c.quien);
        if (yo) personas.add(yo);
        ahora[neg] = { ...ahora[neg], desde: r.hasta || ahora[neg].desde, ultima: new Date().toISOString(), personas: [...personas] };
        escribirJSON(CLAVE, ahora);
        if (cambio) await Inventario.sincronizar(neg);
      }
      if (cambio && typeof cargarConceptos === 'function') {
        await cargarConceptos();
        repintar();
      } else if (estadoVisible()) pintarPanel();
      return cambio;
    })().finally(() => {
      enCurso = null;
      if (pendiente) { pendiente = false; programar(500); }
    });
    return enCurso;
  }
  const estadoVisible = () => !!document.querySelector('#vista-config.activa');

  // Empezar a compartir un negocio: manda todo lo que tiene.
  async function compartir(neg) {
    const lista = compartidos();
    if (!lista[neg]) lista[neg] = { desde: 1, personas: [] };
    escribirJSON(CLAVE, lista);
    for (const t of TABLAS) {
      for (const x of await DB.todosDe(t)) if (negocioDe(t, x) === neg) encolar(t, { ...x, _t: x._t || Date.now() }, false);
    }
    encolarCombos(neg);
    return sincronizar();
  }

  async function unirse(codigo) {
    const neg = String(codigo || '').trim();
    if (!/^[\w-]{3,60}$/.test(neg)) return 'Ese código no parece válido.';
    const lista = compartidos();
    lista[neg] = lista[neg] || { desde: 1, personas: [] };
    escribirJSON(CLAVE, lista);
    await sincronizar();
    if (!(await DB.uno('negocios', neg))) {
      const msg = ultimoError || 'No encontré ese negocio. Revisa el código (y que la otra persona ya lo haya compartido).';
      dejar(neg);
      return msg;
    }
    return '';
  }

  function dejar(neg) {
    const lista = compartidos();
    delete lista[neg];
    escribirJSON(CLAVE, lista);
    escribirJSON(COLA, leerJSON(COLA, []).filter(c => c.negocio !== neg));
  }

  // ---------- Panel en Ajustes ----------
  const hace = iso => {
    if (!iso) return 'todavía no';
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    return s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
  };

  function pintarPanel() {
    const caja = $('compartidos');
    if (!caja) return;
    const lista = compartidos();
    const negs = (typeof estado === 'object' && estado.negocios) || [];
    const cola = leerJSON(COLA, []);
    caja.innerHTML = `
      ${negs.map(n => {
        const c = lista[n.id];
        const falta = cola.filter(x => x.negocio === n.id).length;
        return `<div class="comp-fila">
          <div class="comp-datos"><strong>${escapar(n.nombre)}</strong>
            <small>${c ? `👥 ${escapar((c.personas || []).join(', ') || 'compartido')} · al día ${hace(c.ultima)}${falta ? ` · ${falta} por mandar` : ''}` : 'Solo en este teléfono'}</small></div>
          ${c ? `<button type="button" data-codigo="${escapar(n.id)}">Código</button><button type="button" data-dejar="${escapar(n.id)}">Dejar</button>`
            : `<button type="button" data-compartir="${escapar(n.id)}">Compartir</button>`}
        </div>`;
      }).join('') || '<p class="nota">Todavía no tienes negocios.</p>'}
      ${ultimoError ? `<p class="nota alerta">${escapar(ultimoError)}</p>` : ''}
      <div class="comp-acciones">
        <button type="button" id="comp-unirme">🔗 Unirme con código</button>
        ${Object.keys(lista).length ? '<button type="button" id="comp-ahora">🔄 Actualizar ahora</button>' : ''}
      </div>`;
    caja.querySelectorAll('[data-compartir]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      b.textContent = 'Mandando…';
      await compartir(b.dataset.compartir);
      pintarPanel();
      mostrarCodigo(b.dataset.compartir);
    }));
    caja.querySelectorAll('[data-codigo]').forEach(b => b.addEventListener('click', () => mostrarCodigo(b.dataset.codigo)));
    caja.querySelectorAll('[data-dejar]').forEach(b => b.addEventListener('click', () => {
      dejar(b.dataset.dejar);
      avisar('Este teléfono ya no comparte ese negocio (lo anotado se queda aquí)', null, 5000);
      pintarPanel();
    }));
    const ahora = $('comp-ahora');
    if (ahora) ahora.addEventListener('click', async () => {
      ahora.textContent = 'Actualizando…';
      await sincronizar();
      pintarPanel();
    });
    $('comp-unirme').addEventListener('click', pedirCodigo);
  }

  function mostrarCodigo(neg) {
    const n = ((typeof estado === 'object' && estado.negocios) || []).find(x => x.id === neg);
    const d = $('comp-dialogo');
    $('comp-titulo').textContent = `Compartir «${n ? n.nombre : 'negocio'}»`;
    $('comp-cuerpo').innerHTML = `
      <p class="nota">La otra persona abre MIG → Ajustes → Negocios compartidos → «Unirme con código» y pega:</p>
      <p class="comp-codigo">${escapar(neg)}</p>
      <p class="nota">Tiene que entrar con su propia contraseña (en tu hoja: menú Finanzas IA → Agregar otra persona).</p>`;
    $('comp-form').codigo.hidden = true;
    $('comp-copiar').hidden = false;
    $('comp-copiar').onclick = () => {
      navigator.clipboard?.writeText(neg).then(() => avisar('Código copiado'), () => avisar('Mantén presionado el código para copiarlo'));
    };
    d.showModal();
  }

  function pedirCodigo() {
    const d = $('comp-dialogo'), f = $('comp-form');
    $('comp-titulo').textContent = 'Unirme a un negocio';
    $('comp-cuerpo').innerHTML = '<p class="nota">Pega el código que te pasaron. El negocio aparece arriba con todo lo anotado y desde ahí se van al día los dos teléfonos.</p>';
    f.codigo.hidden = false;
    f.codigo.value = '';
    $('comp-copiar').hidden = true;
    d.showModal();
    d.addEventListener('close', async () => {
      if (d.returnValue !== 'listo' || f.codigo.hidden || !f.codigo.value.trim()) return;
      avisar('Buscando el negocio…');
      const error = await unirse(f.codigo.value);
      if (error) { avisar(error, null, 7000); pintarPanel(); return; }
      await cargarConceptos();
      avisar('¡Listo! Ya compartes este negocio', null, 4000);
      repintar();
      pintarPanel();
    }, { once: true });
  }

  // Al cambiar algo en un negocio compartido, se manda; cada 20 s (con la app abierta) se trae lo nuevo.
  DB.alCambiar(encolar);
  window.addEventListener('combos', e => encolarCombos(e.detail));
  window.addEventListener('online', () => programar(500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) programar(300); });
  setInterval(() => { if (!document.hidden && Object.keys(compartidos()).length) sincronizar(); }, 20000);
  setTimeout(() => sincronizar(), 2000);

  return { sincronizar, compartir, unirse, dejar, pintarPanel, esCompartido, yo: () => yo, mezclarInventario };
})();
