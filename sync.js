// Negocios compartidos: lo que se anota en un negocio compartido se manda al Apps Script de fer
// (pestaña «Compartido») y se trae lo que anotaron los demás. Cada registro gana por su `_t`
// (el cambio más nuevo). El inventario se junta: se suman las líneas del historial de los dos.
const Sync = (() => {
  const CLAVE = 'compartidos'; // { idNegocio: { desde: fila, ultima: iso, personas: [nombres] } }
  const COLA = 'sync-cola';
  const TABLAS = ['negocios', 'conceptos', 'movimientos', 'inventario', 'deudas'];
  const leerJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || '') || def; } catch { return def; } };
  const escribirJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  // Cada compartido: { desde, ultima, personas, local (negocio de este teléfono), grupo (solo algunos productos), nombre }.
  // El código de un negocio entero es su id; el de un grupo de productos empieza con "g".
  const compartidos = () => leerJSON(CLAVE, {});
  const localDe = (code, c) => (c.grupo ? c.local || '' : c.local || code);
  const esCompartido = id => !!(id && Object.entries(compartidos()).some(([code, c]) => !c.grupo && localDe(code, c) === id));
  let yo = localStorage.getItem('sync-yo') || '';
  let enCurso = null, pendiente = false, temporizador = null, ultimoError = '';

  const negocioDe = (tabla, x) => (tabla === 'negocios' ? x.id : x.negocio || '');
  // Del inventario solo viaja lo que no sale de una venta (cada teléfono descuenta sus ventas solo).
  function paraMandar(tabla, x) {
    if (tabla !== 'inventario') return x;
    return { ...x, historial: (x.historial || []).filter(h => !h.mov || h.editado) };
  }

  // A qué compartido va un registro (código) o null.
  function compartidoDe(tabla, x) {
    const lista = compartidos();
    if ((tabla === 'inventario' || tabla === 'movimientos') && x.grupo && lista[x.grupo]) return x.grupo;
    const neg = negocioDe(tabla, x);
    if (!neg) return null;
    return Object.keys(lista).find(code => !lista[code].grupo && localDe(code, lista[code]) === neg) || null;
  }

  function meterEnCola(code, tabla, x, borrado) {
    const c = compartidos()[code];
    let dato = borrado ? null : paraMandar(tabla, x);
    // En un grupo el negocio de cada teléfono es otro: viaja sin negocio y cada uno pone el suyo.
    if (dato && c && c.grupo && tabla !== 'grupo') dato = { ...dato, negocio: '' };
    const cola = leerJSON(COLA, []).filter(k => !(k.tabla === tabla && k.id === x.id && k.negocio === code));
    cola.push({ negocio: code, tabla, id: x.id, t: x._t || Date.now(), dato });
    escribirJSON(COLA, cola);
    programar(1500);
  }

  // Una venta de un negocio con productos compartidos va al grupo si nombra uno de esos productos.
  async function grupoDeVenta(x) {
    const lista = compartidos();
    const grupos = Object.keys(lista).filter(code => lista[code].grupo && lista[code].local && lista[code].local === (x.negocio || ''));
    if (!grupos.length) return null;
    const items = (await DB.inventario()).filter(i => i.negocio === x.negocio);
    for (const code of grupos) {
      const suyos = items.filter(i => i.grupo === code);
      if (suyos.length && Inventario.productosDe(x, items).some(p => p.item.grupo === code)) return code;
    }
    return null;
  }

  async function encolar(tabla, x, borrado) {
    let code = compartidoDe(tabla, x);
    if (!code && tabla === 'movimientos' && !borrado) {
      code = await grupoDeVenta(x);
      if (code) { x.grupo = code; await DB.ponerSinAviso('movimientos', x); }
    }
    if (code) meterEnCola(code, tabla, x, borrado);
  }

  function encolarCombos(neg) {
    if (!esCompartido(neg)) return;
    const code = compartidoDe('negocios', { id: neg });
    const cola = leerJSON(COLA, []).filter(c => !(c.tabla === 'combos' && c.negocio === code));
    cola.push({ negocio: code, tabla: 'combos', id: 'combos-' + neg, t: Number(localStorage.getItem(`inv-combos-${neg}-t`)) || Date.now(),
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

  // Al unirse a un grupo, sus productos van a un negocio nuevo con el nombre del grupo.
  async function negocioParaGrupo(code, nombre) {
    const negs = await DB.negocios();
    const ya = negs.find(n => n.nombre.toLowerCase() === nombre.toLowerCase());
    if (ya) return ya.id;
    if (negs.length >= 3) return '';
    const n = { id: 'n' + Date.now().toString(36), nombre: nombre.slice(0, 30), orden: negs.length, personaje: 'oso' };
    await DB.ponerSinAviso('negocios', n);
    const total = (await DB.conceptos()).length;
    for (const c of DB.conceptosNegocio(n.id, total)) await DB.ponerSinAviso('conceptos', c);
    return n.id;
  }

  async function aplicar(code, cambios) {
    let hubo = false;
    const lista = compartidos();
    const sh = lista[code] || {};
    const neg = localDe(code, sh);
    if (sh.grupo) {
      const meta = cambios.filter(c => c.tabla === 'grupo').pop();
      if (meta && meta.dato) sh.nombre = meta.dato.nombre || sh.nombre;
      if (!sh.local && sh.nombre) { sh.local = await negocioParaGrupo(code, sh.nombre); hubo = true; }
      lista[code] = sh;
      escribirJSON(CLAVE, lista);
      if (!sh.local) return false;
    }
    const conceptosLocales = sh.grupo ? (await DB.conceptos()).filter(c => c.negocio === sh.local && !c.oculto) : [];
    // El concepto del otro teléfono puede no existir aquí: se usa uno del mismo tipo (ventas para ingresos).
    const conceptoLocal = async (id, tipo) => {
      if (await DB.uno('conceptos', id)) return id;
      const mismos = conceptosLocales.filter(c => c.tipo === tipo);
      return ((tipo === 'ingreso' && mismos.find(c => /venta/i.test(c.nombre))) || mismos[0] || {}).id || id;
    };
    for (const c of cambios) {
      if (c.tabla === 'grupo') continue;
      if (sh.grupo && c.dato) {
        c.dato = { ...c.dato, negocio: sh.local, grupo: code };
        if (c.tabla === 'movimientos') c.dato.concepto = await conceptoLocal(c.dato.concepto, c.dato.tipo);
        if (!['movimientos', 'inventario'].includes(c.tabla)) continue;
      }
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
        const r = await Voz.llamar({ tipo: 'sync', negocio: neg, desde: (compartidos()[neg] || lista[neg]).desde || 1,
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
        if (cambio && localDe(neg, ahora[neg])) await Inventario.sincronizar(localDe(neg, ahora[neg]));
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
    if (!lista[neg]) lista[neg] = { desde: 1, personas: [], local: neg };
    escribirJSON(CLAVE, lista);
    for (const t of TABLAS) {
      for (const x of await DB.todosDe(t)) if (negocioDe(t, x) === neg) encolar(t, { ...x, _t: x._t || Date.now() }, false);
    }
    encolarCombos(neg);
    return sincronizar();
  }

  // Compartir solo algunos productos de un negocio (con sus ventas). Devuelve el código.
  async function compartirGrupo(neg, ids, nombre, code) {
    code = code || 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const lista = compartidos();
    lista[code] = { ...(lista[code] || { desde: 1, personas: [] }), grupo: true, local: neg, nombre };
    escribirJSON(CLAVE, lista);
    meterEnCola(code, 'grupo', { id: code, _t: Date.now(), nombre }, false);
    for (const it of (await DB.inventario()).filter(i => i.negocio === neg)) {
      const dentro = ids.includes(it.id);
      if (dentro && it.grupo !== code) { it.grupo = code; await DB.guardarInventario(it); }
      if (!dentro && it.grupo === code) { delete it.grupo; await DB.ponerSinAviso('inventario', it); }
    }
    for (const m of (await DB.todos()).filter(x => x.negocio === neg && !x.grupo)) await encolar('movimientos', m, false);
    await sincronizar();
    return code;
  }

  async function unirse(codigo) {
    const neg = String(codigo || '').trim();
    if (!/^[\w-]{3,60}$/.test(neg)) return 'Ese código no parece válido.';
    const lista = compartidos();
    const grupo = /^g/.test(neg);
    lista[neg] = lista[neg] || { desde: 1, personas: [], grupo, local: grupo ? '' : neg };
    escribirJSON(CLAVE, lista);
    await sincronizar();
    if (grupo) {
      const c = compartidos()[neg];
      if (c && c.local) return '';
      dejar(neg);
      return ultimoError || ((await DB.negocios()).length >= 3 && c && c.nombre ? 'Ya tienes 3 negocios: borra uno para unirte.' : 'No encontré esos productos. Revisa el código.');
    }
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
        const c = lista[n.id] && !lista[n.id].grupo ? lista[n.id] : null;
        const falta = cola.filter(x => x.negocio === n.id).length;
        return `<div class="comp-fila">
          <div class="comp-datos"><strong>${escapar(n.nombre)}</strong>
            <small>${c ? `👥 ${escapar((c.personas || []).join(', ') || 'compartido')} · al día ${hace(c.ultima)}${falta ? ` · ${falta} por mandar` : ''}` : 'Solo en este teléfono'}</small></div>
          ${c ? `<button type="button" data-codigo="${escapar(n.id)}">Código</button><button type="button" data-dejar="${escapar(n.id)}">Dejar</button>`
            : `<button type="button" data-compartir="${escapar(n.id)}">Compartir</button>`}
        </div>`;
      }).join('') || '<p class="nota">Todavía no tienes negocios.</p>'}
      ${Object.entries(lista).filter(([, c]) => c.grupo).map(([code, c]) => {
        const n = negs.find(x => x.id === c.local);
        const falta = cola.filter(x => x.negocio === code).length;
        return `<div class="comp-fila">
          <div class="comp-datos"><strong>🏷️ ${escapar(c.nombre || 'Productos')}</strong>
            <small>Solo esos productos${n ? `, dentro de «${escapar(n.nombre)}»` : ''} · 👥 ${escapar((c.personas || []).join(', ') || 'compartido')} · al día ${hace(c.ultima)}${falta ? ` · ${falta} por mandar` : ''}</small></div>
          <button type="button" data-codigo="${escapar(code)}">Código</button><button type="button" data-dejar="${escapar(code)}">Dejar</button>
        </div>`;
      }).join('')}
      <p class="nota">Para compartir solo algunos productos de un negocio: entra al negocio → 📦 Inventario → «👥 Compartir productos».</p>
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
    const g = compartidos()[neg];
    const n = g && g.grupo ? { nombre: g.nombre } : ((typeof estado === 'object' && estado.negocios) || []).find(x => x.id === neg);
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
    $('comp-cuerpo').innerHTML = '<p class="nota">Pega el código que te pasaron. El negocio (o los productos compartidos, en un negocio con su nombre) aparece arriba con todo lo anotado, y desde ahí se van al día los dos teléfonos.</p>';
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

  // Ventana en Inventario: elegir qué productos compartir y con qué nombre.
  async function abrirGrupo(neg) {
    const items = (await DB.inventario()).filter(i => i.negocio === neg).sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!items.length) { avisar('Primero agrega productos a este inventario'); return; }
    const lista = compartidos();
    const code = Object.keys(lista).find(k => lista[k].grupo && lista[k].local === neg);
    const g = code ? lista[code] : null;
    const $o = document.createElement('div');
    $o.className = 'modal-overlay';
    document.body.appendChild($o);
    $o.innerHTML = `
      <form class="modal inv-importar">
        <h2>👥 Compartir productos</h2>
        <p class="nota">Elige los productos que compartes (por ejemplo los emblemas con tu socio). La otra persona solo ve esos productos y las ventas que los nombran; el resto del negocio sigue siendo solo tuyo.</p>
        <label>Nombre de lo que compartes<input name="nombre" maxlength="30" value="${escapar(g ? g.nombre : '')}" placeholder="Emblemas" required></label>
        <div class="imp-lista">${items.map(i => `
          <label class="imp-fila"><input type="checkbox" name="p" value="${escapar(i.id)}" ${(code ? i.grupo === code : /emblem/i.test(i.nombre)) ? 'checked' : ''}>
            <span class="imp-datos"><strong>${escapar(i.nombre)}</strong><small>quedan ${escapar(Inventario.cuanto(i, i.stockActual))}</small></span></label>`).join('')}</div>
        <div class="editor-botones">
          <button type="button" value="no">Cancelar</button>
          <button type="submit" class="principal">${code ? 'Guardar' : 'Compartir'}</button>
        </div>
      </form>`;
    const f = $o.querySelector('form');
    const ok = await new Promise(r => {
      $o.querySelector('[value=no]').addEventListener('click', () => r(false));
      f.addEventListener('submit', e => { e.preventDefault(); r(true); });
    });
    const ids = [...f.querySelectorAll('[name=p]:checked')].map(x => x.value);
    const nombre = f.nombre.value.trim() || 'Productos';
    $o.remove();
    if (!ok) return;
    if (!ids.length) { avisar('Marca al menos un producto'); return; }
    avisar('Compartiendo…');
    const nuevo = await compartirGrupo(neg, ids, nombre, code);
    repintar();
    mostrarCodigo(nuevo);
  }

  return { abrirGrupo, compartirGrupo, sincronizar, compartir, unirse, dejar, pintarPanel, esCompartido, yo: () => yo, mezclarInventario };
})();
