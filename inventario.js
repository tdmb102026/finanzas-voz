// Módulo Inventario: gestiona stock de productos en un negocio.
// Uso: crear productos, registrar movimientos (compras/ventas), ver historial.

const Inventario = (() => {
  const STOCK_MINIMO_DEFAULT = 10;
  // Cada línea del historial tiene su id (`hid`) para poder editarla o borrarla.
  const nuevoHid = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Ventas que fer quitó del historial: ya no descuentan ese producto.
  // Productos que se venden por partes (Magis TV: 1 crédito = 3 usuarios). Todo se guarda en partes.
  const porPartes = item => Math.max(1, item.partes || 1);
  const palabrasLista = t => String(t || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean);
  const plural = (w, n) => (n === 1 ? w : /[aeiouáéíóú]$/i.test(w) ? w + 's' : w + 'es');
  // Texto de una cantidad: "48 créditos y 2 usuarios" (o solo el número si no va por partes).
  function cuanto(item, n) {
    const p = porPartes(item);
    if (p === 1) return String(n);
    const neg = n < 0;
    n = Math.abs(n);
    const e = Math.floor(n / p), r = n % p;
    const u = palabrasLista(item.unidad)[0] || 'entero', pa = palabrasLista(item.parte)[0] || 'parte';
    return (neg ? '−' : '') + [e || !r ? `${e} ${plural(u, e)}` : '', r ? `${r} ${plural(pa, r)}` : ''].filter(Boolean).join(' y ');
  }
  const ignorado = (item, movId) => (item.ignorados || []).includes(movId);
  // Tarjetas abiertas: siguen abiertas al repintar.
  const abiertos = new Set();

  async function porNegocio(negocio) {
    const lista = await DB.inventario();
    return lista.filter(i => i.negocio === negocio).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  function nuevoId(negocio, nombre) {
    return `inv-${negocio}-${nombre.toLowerCase().replace(/\s+/g, '-')}`;
  }

  async function crear(negocio, nombre, stockInicial) {
    const id = nuevoId(negocio, nombre);
    const item = {
      id,
      nombre,
      negocio,
      stockActual: stockInicial || 0,
      stockInicial: stockInicial || 0,
      stockMinimo: STOCK_MINIMO_DEFAULT,
      desde: fechaLocal().slice(0, 10),
      historial: [],
    };
    await DB.guardarInventario(item);
    return item;
  }

  async function registrarMovimiento(id, tipo, cantidad, nota, fuente = 'manual') {
    const items = await DB.inventario();
    const item = items.find(i => i.id === id);
    if (!item) return null;

    const ahora = new Date();
    const fecha = fechaLocal(ahora).slice(0, 10);
    const entrada = { hid: nuevoHid(), fecha, tipo, cantidad, nota, fuente };
    item.historial.push(entrada);

    // Actualizar stock
    if (tipo === 'compra') item.stockActual += cantidad;
    else if (tipo === 'venta') item.stockActual = Math.max(0, item.stockActual - cantidad);

    await DB.guardarInventario(item);
    return item;
  }

  async function pintar(negocio, padre = 'inventario') {
    await sincronizar(negocio);
    const items = await porNegocio(negocio);
    const $div = $(padre);
    if (!$div) {
      return;
    }
    $div.innerHTML = '';

    if (!items.length) {
      $div.innerHTML = '<p style="text-align: center; color: var(--suave);">Sin productos. Agregar uno arriba.</p>';
      return;
    }

    // Resumen de todo el inventario arriba.
    const mes = fechaLocal().slice(0, 7);
    const vendidas = item => item.historial.filter(h => h.tipo === 'venta' && String(h.fecha).startsWith(mes))
      .reduce((a, h) => a + h.cantidad, 0);
    const solo = items.length === 1 && porPartes(items[0]) > 1 ? items[0] : null;
    const total = solo ? cuanto(solo, solo.stockActual) : items.reduce((a, x) => a + Math.floor(x.stockActual / porPartes(x)), 0);
    const vendidasMes = solo ? cuanto(solo, vendidas(solo)) : items.reduce((a, x) => a + Math.floor(vendidas(x) / porPartes(x)), 0);
    const bajos = items.filter(x => x.stockActual <= x.stockMinimo);
    // Plata por producto: ventas menos gastos (envíos, etc.) que nombran el producto. Un combo se reparte por unidades.
    const plata = {};
    for (const x of items) plata[x.id] = { ventas: 0, gastos: 0, ventasMes: 0, gastosMes: 0 };
    const todosMovs = await DB.todos();
    const porFrase = ventasPorFrase(todosMovs.filter(m => (m.negocio || '') === negocio));
    for (const m of todosMovs) {
      if ((m.negocio || '') !== negocio || m.estado === 'pendiente' || (m.tipo !== 'ingreso' && m.tipo !== 'gasto')) continue;
      const dia = String(m.fecha).slice(0, 10);
      const ps = productosDe(m, items, (porFrase[m.frase] || 0) <= 1).filter(p => dia >= (p.item.desde || DESDE_ANTIGUO) && !ignorado(p.item, m.id));
      const unidades = ps.reduce((a, p) => a + p.cantidad, 0);
      for (const p of ps) {
        const parte = Math.round((m.monto || 0) * p.cantidad / unidades);
        const k = m.tipo === 'ingreso' ? 'ventas' : 'gastos';
        plata[p.item.id][k] += parte;
        if (dia.startsWith(mes)) plata[p.item.id][k + 'Mes'] += parte;
      }
    }
    const netoMes = items.reduce((a, x) => a + plata[x.id].ventasMes - plata[x.id].gastosMes, 0);
    const $res = document.createElement('div');
    $res.className = 'inventario-resumen';
    $res.innerHTML = `
      <div><strong>${total}</strong><small>${solo ? "en bodega" : "unidades en bodega"}</small></div>
      <div><strong>${vendidasMes}</strong><small>vendidas este mes</small></div>
      <div><strong>${dinero(netoMes)}</strong><small>ganado este mes</small></div>
      <div><strong class="${bajos.length ? 'stock-bajo' : ''}">${bajos.length}</strong><small>con stock bajo</small></div>`;
    $div.appendChild($res);
    const $todo = document.createElement('button');
    $todo.type = 'button';
    $todo.className = 'inv-todo';
    $todo.textContent = items.every(x => abiertos.has(x.id)) ? 'Cerrar todos' : 'Abrir todos';
    $todo.addEventListener('click', () => {
      const abrir = !items.every(x => abiertos.has(x.id));
      items.forEach(x => (abrir ? abiertos.add(x.id) : abiertos.delete(x.id)));
      pintar(negocio, padre);
    });
    const $fila = document.createElement('div');
    $fila.className = 'inv-fila-arriba';
    const $curva = document.createElement('button');
    $curva.type = 'button';
    $curva.className = 'inv-todo';
    $curva.textContent = '📈 Ver todos en una curva';
    $curva.addEventListener('click', () => abrirCurva(items));
    $fila.append($curva, $todo);
    $div.appendChild($fila);

    const hoy = new Date();
    const diaStr = d => fechaLocal(d).slice(0, 10);
    const hace = n => { const d = new Date(hoy); d.setDate(d.getDate() - n); return diaStr(d); };
    const DIAS_GRAFICO = 14;
    items.forEach(item => {
      const alerta = item.stockActual <= item.stockMinimo;
      const salidas = item.historial.filter(h => h.tipo === 'venta');
      const entradas = item.historial.filter(h => h.tipo === 'compra');
      const salieron = salidas.reduce((a, h) => a + h.cantidad, 0);
      const entraron = entradas.reduce((a, h) => a + h.cantidad, 0);
      const tope = Math.max(item.stockInicial + entraron, item.stockActual, 1);
      const p = porPartes(item), c = n => cuanto(item, n);
      const pct = Math.round(item.stockActual / tope * 100);
      // Ritmo: lo vendido en los últimos 30 días.
      // Si el inventario empezó hace menos de 30 días, se cuenta desde ahí (mínimo una semana).
      const desde = item.desde || DESDE_ANTIGUO;
      const dias = Math.min(30, Math.max(7, Math.round((hoy - new Date(desde + 'T00:00:00')) / 864e5) + 1));
      const ult30 = salidas.filter(h => h.fecha >= hace(dias - 1)).reduce((a, h) => a + h.cantidad, 0);
      const porSemana = ult30 / dias * 7;
      const dura = ult30 ? Math.floor(item.stockActual / (ult30 / dias)) : null;
      const porDia = [];
      for (let i = DIAS_GRAFICO - 1; i >= 0; i--) {
        const f = hace(i);
        porDia.push({ f, n: salidas.filter(h => h.fecha === f).reduce((a, h) => a + h.cantidad, 0) });
      }
      const maxDia = Math.max(3, ...porDia.map(d => d.n));
      const ultimos = [...item.historial].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 5);
      const pl = plata[item.id];
      const $card = document.createElement('details');
      $card.className = 'inventario-card' + (alerta ? ' alerta' : '');
      $card.dataset.id = item.id;
      $card.open = abiertos.has(item.id);
      $card.addEventListener('toggle', () => { if ($card.open) abiertos.add(item.id); else abiertos.delete(item.id); });
      $card.innerHTML = `
        <summary>
          <div class="inventario-header">
            <span class="inventario-nombre">${escapar(item.nombre)}</span>
            <span class="inventario-stock${alerta ? ' stock-bajo' : ''}">${p > 1 ? `<strong>${c(item.stockActual)}</strong>` : `<strong>${item.stockActual}</strong> de ${tope}`}</span>
          </div>
          <div class="inv-barra${alerta ? ' baja' : ''}"><i style="width:${pct}%"></i></div>
          <div class="inv-pie">
            <p class="inventario-vendidas">Vendidas este mes: ${c(vendidas(item))} · <b class="inv-plata">${dinero(pl.ventasMes - pl.gastosMes)}</b>${alerta ? '<br>⚠️ stock bajo' : ''}</p>
            <span class="inv-paso">
              <button type="button" class="inv-uno" data-id="${escapar(item.id)}" data-tipo="venta" aria-label="Sacar uno">−</button>
              <button type="button" class="inv-uno" data-id="${escapar(item.id)}" data-tipo="compra" aria-label="Agregar uno">+</button>
            </span>
            <span class="inv-flecha">›</span>
          </div>
        </summary>
        <div class="inv-detalle">
          <div class="inv-datos">
            <div><strong>${c(item.stockInicial)}</strong><small>al empezar</small></div>
            <div><strong>+${c(entraron)}</strong><small>entraron</small></div>
            <div><strong>${salieron ? `−${c(salieron)}` : 0}</strong><small>salieron</small></div>
            <div><strong>${p > 1 ? c(Math.round(porSemana)) : porSemana ? porSemana.toFixed(1).replace('.0', '') : '0'}</strong><small>por semana</small></div>
          </div>
          ${p > 1 ? `<p class="nota">1 ${escapar(palabrasLista(item.unidad)[0] || 'entero')} = ${p} ${escapar(plural(palabrasLista(item.parte)[0] || 'parte', p))}. El gráfico y los − / + van de a ${escapar(palabrasLista(item.parte)[0] || 'parte')}.</p>` : ''}
          <div class="inv-ganancia">
            <div><small>Este mes</small><span>Ventas <b>${dinero(pl.ventasMes)}</b></span><span>Envíos y gastos <b>−${dinero(pl.gastosMes)}</b></span><span class="neto">Ganaste <b>${dinero(pl.ventasMes - pl.gastosMes)}</b></span></div>
            <div><small>Desde que empezaste</small><span>Ventas <b>${dinero(pl.ventas)}</b></span><span>Envíos y gastos <b>−${dinero(pl.gastos)}</b></span><span class="neto">Ganaste <b>${dinero(pl.ventas - pl.gastos)}</b></span></div>
          </div>
          <p class="nota">${dura === null ? 'Sin ventas en los últimos 30 días.' : `A este ritmo te alcanza para unos <strong>${dura} días</strong>.`}</p>
          <div class="inv-grafico" aria-label="Ventas de los últimos ${DIAS_GRAFICO} días">
            ${porDia.map(d => `<span title="${d.f}: ${d.n}"><i style="height:${Math.round(d.n / maxDia * 100)}%"></i>${d.n ? `<b>${d.n}</b>` : ''}</span>`).join('')}
          </div>
          <p class="inv-grafico-pie"><span>hace ${DIAS_GRAFICO - 1} días</span><span>hoy</span></p>
          ${ultimos.length ? `<ul class="inv-ultimos">${ultimos.map(h => `
            <li><span>${h.tipo === 'compra' ? '📥' : '📤'} ${h.tipo === 'compra' ? '+' : '−'}${c(h.cantidad)}</span>
              <small>${escapar(h.nota || '')}</small><small>${escapar(String(h.fecha).slice(5).split('-').reverse().join('/'))}</small></li>`).join('')}</ul>`
            : '<p class="nota">Todavía sin movimientos.</p>'}
          <div class="inventario-acciones">
            <button type="button" class="inv-menos" data-id="${escapar(item.id)}">− Sacar varias</button>
            <button type="button" class="inv-mas" data-id="${escapar(item.id)}">+ Agregar varias</button>
            <button type="button" class="inv-hist" data-id="${escapar(item.id)}">Historial</button>
          </div>
          <div class="inv-editar-fila">
            <button type="button" class="inv-editar" data-id="${escapar(item.id)}">✏️ Editar stock inicial</button>
            <button type="button" class="inv-borrar" data-id="${escapar(item.id)}">🗑️ Borrar producto</button>
          </div>
        </div>
      `;
      $div.appendChild($card);
    });

    // Event listeners
    // Combos del negocio, debajo de los productos.
    const lista = combos(negocio);
    const $combos = document.createElement('section');
    $combos.className = 'inv-combos';
    $combos.innerHTML = `
      <h2>🎁 Combos</h2>
      <p class="nota">Arma un combo con los productos que lleva y cómo lo dices. Al venderlo (por voz o con su botón en Anotar → Venta) se descuenta cada producto.</p>
      ${lista.map(c => `
        <button type="button" class="inv-combo" data-combo="${escapar(c.id)}">
          <strong>${escapar(c.nombre)}</strong>
          <small>${items.filter(i => c.partes[i.id] > 0).map(i => `${c.partes[i.id]} ${escapar(i.nombre)}`).join(' + ') || 'sin productos'}</small>
          ${c.frases ? `<small>🎙️ «${escapar(c.frases)}»</small>` : ''}
        </button>`).join('')}
      <button type="button" class="inv-nuevo-combo">+ Nuevo combo</button>`;
    $div.appendChild($combos);
    $combos.querySelectorAll('[data-combo]').forEach(b => b.addEventListener('click', () => editarCombo(negocio, items, lista.find(c => c.id === b.dataset.combo))));
    $combos.querySelector('.inv-nuevo-combo').addEventListener('click', () => editarCombo(negocio, items, null));
    $div.querySelectorAll('.inv-editar').forEach(b => b.addEventListener('click', () => editarProducto(items.find(i => i.id === b.dataset.id))));
    $div.querySelectorAll('.inv-borrar').forEach(b => b.addEventListener('click', () => borrarProducto(items.find(i => i.id === b.dataset.id))));

    // − / + de la tarjeta: de a uno, sin abrirla (están dentro del summary).
    $div.querySelectorAll('.inv-uno').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      deAUno(b.dataset.id, b.dataset.tipo);
    }));
    $div.querySelectorAll('.inv-menos').forEach(b => b.addEventListener('click', () => restarStock(b.dataset.id)));
    $div.querySelectorAll('.inv-mas').forEach(b => b.addEventListener('click', () => sumarStock(b.dataset.id)));
    $div.querySelectorAll('.inv-hist').forEach(b => b.addEventListener('click', () => {
      const item = items.find(i => i.id === b.dataset.id);
      if (item) abrirHistorial(item);
    }));
  }

  // prompt() no funciona dentro de la app Android (WebView): se usa un diálogo propio.
  function pedir({ titulo, nota = '', conNombre = false, textoCantidad = 'Unidades', cantidad = '' }) {
    const d = $('inv-dialogo'), f = $('inv-form');
    $('inv-titulo').textContent = titulo;
    $('inv-nota').textContent = nota;
    $('inv-nota').hidden = !nota;
    $('inv-nombre-fila').hidden = !conNombre;
    $('inv-cantidad-texto').textContent = textoCantidad;
    f.nombre.value = '';
    f.cantidad.value = cantidad;
    d.showModal();
    setTimeout(() => (conNombre ? f.nombre : f.cantidad).focus(), 50);
    return new Promise(listo => d.addEventListener('close', () => {
      if (d.returnValue !== 'guardar') return listo(null);
      listo({ nombre: f.nombre.value.trim(), cantidad: parseInt(f.cantidad.value, 10) });
    }, { once: true }));
  }

  function confirmar(titulo, nota, boton) {
    const d = $('inv-confirmar');
    $('inv-confirmar-titulo').textContent = titulo;
    $('inv-confirmar-nota').textContent = nota;
    $('inv-confirmar-si').textContent = boton;
    d.showModal();
    return new Promise(listo => d.addEventListener('close', () => listo(d.returnValue === 'si'), { once: true }));
  }

  async function borrarProducto(item) {
    if (!item) return;
    const ok = await confirmar(`¿Borrar ${item.nombre}?`, `Se quita del inventario con su historial (${item.stockActual} unidades). Tus ventas anotadas no se borran.`, 'Borrar');
    if (!ok) return;
    await DB.borrarInventario(item.id);
    abiertos.delete(item.id);
    repintar();
    avisar(`Borrado: ${item.nombre}`, async () => { await DB.guardarInventario(item); repintar(); }, 6000);
  }

  function editarCombo(negocio, items, combo) {
    const d = $('combo-dialogo'), f = $('combo-form');
    $('combo-titulo').textContent = combo ? 'Editar combo' : 'Nuevo combo';
    f.nombre.value = combo ? combo.nombre : `Combo ${combos(negocio).length + 1}`;
    f.frases.value = combo ? combo.frases || '' : '';
    $('combo-partes').innerHTML = items.map(i => `
      <label class="combo-parte"><span>${escapar(i.nombre)}</span>
        <span class="inv-paso">
          <button type="button" class="inv-uno" data-paso="-1">−</button>
          <input name="p-${escapar(i.id)}" type="number" inputmode="numeric" min="0" step="1" value="${combo ? combo.partes[i.id] || 0 : 1}">
          <button type="button" class="inv-uno" data-paso="1">+</button>
        </span>
      </label>`).join('');
    $('combo-partes').onclick = e => {
      const b = e.target.closest('[data-paso]');
      if (!b) return;
      const inp = b.parentElement.querySelector('input');
      inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + Number(b.dataset.paso));
    };
    $('combo-borrar').hidden = !combo;
    d.showModal();
    d.addEventListener('close', () => {
      let lista = combos(negocio);
      if (d.returnValue === 'borrar' && combo) {
        guardarCombos(negocio, lista.filter(c => c.id !== combo.id));
        avisar(`Borrado: ${combo.nombre}`, () => { guardarCombos(negocio, [...combos(negocio), combo]); repintar(); }, 6000);
      } else if (d.returnValue === 'guardar') {
        const partes = {};
        for (const i of items) { const n = parseInt(f['p-' + i.id].value, 10) || 0; if (n > 0) partes[i.id] = n; }
        const nuevo = { id: combo ? combo.id : 'c' + Date.now().toString(36), nombre: f.nombre.value.trim() || 'Combo', frases: f.frases.value.trim(), partes };
        lista = combo ? lista.map(c => (c.id === combo.id ? nuevo : c)) : [...lista, nuevo];
        guardarCombos(negocio, lista);
        avisar(`Guardado: ${nuevo.nombre}`);
      }
      repintar();
    }, { once: true });
  }

  function deAUno(id, tipo) {
    const r = cola.then(async () => {
      const item = await registrarMovimiento(id, tipo, 1, tipo === 'venta' ? 'Salida manual' : 'Entrada manual');
      if (!item) return;
      vibrar(10);
      avisar(`${item.nombre}: ${tipo === 'venta' ? '−' : '+'}${cuanto(item, 1)} → quedan ${cuanto(item, item.stockActual)}`, () => deshacerUno(id));
      if (tipo === 'venta' && item.stockActual === item.stockMinimo) avisar(`⚠️ Stock bajo: quedan ${cuanto(item, item.stockActual)} de ${item.nombre}`, () => deshacerUno(id), 5000);
      repintar();
    });
    cola = r.catch(() => {});
  }

  function deshacerUno(id) {
    const r = cola.then(async () => {
      const item = (await DB.inventario()).find(i => i.id === id);
      const h = item && item.historial[item.historial.length - 1];
      if (!h || h.mov || h.cantidad !== 1) return;
      item.historial.pop();
      item.stockActual += h.tipo === 'venta' ? 1 : -1;
      await DB.guardarInventario(item);
      repintar();
    });
    cola = r.catch(() => {});
    return r;
  }

  const restarStock = id => abrirMov(id, { tipo: 'venta' });
  const sumarStock = id => abrirMov(id, { tipo: 'compra' });

  // Agregar, retirar o editar una línea del historial, con la fecha que fer quiera.
  async function abrirMov(id, { tipo, h } = {}) {
    const d = $('inv-mov'), f = $('inv-mov-form');
    const item = (await DB.inventario()).find(i => i.id === id);
    if (!item) return false;
    const hoy = fechaLocal().slice(0, 10);
    $('inv-mov-titulo').textContent = `${h ? 'Editar' : tipo === 'compra' ? 'Agregar' : 'Retirar'} · ${item.nombre}`;
    f.tipo.value = h ? h.tipo : tipo;
    f.querySelectorAll('[name=tipo]').forEach(r => { r.disabled = !!(h && h.mov); });
    const p = porPartes(item);
    $('inv-mov-en').hidden = p === 1;
    f.en.innerHTML = p === 1 ? '<option value="1">unidades</option>'
      : `<option value="${p}">${escapar(plural(palabrasLista(item.unidad)[0] || 'entero', 2))} (de ${p})</option><option value="1">${escapar(plural(palabrasLista(item.parte)[0] || 'parte', 2))}</option>`;
    f.en.value = h && h.cantidad % p ? 1 : p;
    f.cantidad.value = h ? h.cantidad / Number(f.en.value) : 1;
    f.fecha.value = h ? h.fecha : hoy;
    f.fecha.max = hoy;
    f.nota.value = h ? (h.nota || '') : '';
    $('inv-mov-nota').textContent = h && h.mov ? 'Viene de una venta anotada: puedes cambiar cantidad, fecha y nota.' : `Ahora hay ${cuanto(item, item.stockActual)}.`;
    $('inv-mov-borrar').hidden = !h;
    d.showModal();
    setTimeout(() => f.cantidad.select(), 50);
    const valor = await new Promise(listo => d.addEventListener('close', () => listo(d.returnValue), { once: true }));
    if (valor === 'borrar' && h) { await quitarEntrada(id, h); repintar(); return true; }
    if (valor !== 'guardar') return false;
    const cantidad = Math.max(0, parseInt(f.cantidad.value, 10) || 0) * (Number(f.en.value) || 1);
    if (!cantidad) return false;
    const nuevo = { tipo: f.tipo.value, cantidad, fecha: f.fecha.value || hoy, nota: f.nota.value.trim() };
    const r = cola.then(async () => {
      const x = (await DB.inventario()).find(i => i.id === id);
      if (!x) return;
      const signo = t => (t === 'compra' ? 1 : -1);
      if (h) {
        const e = x.historial.find(k => (h.hid && k.hid === h.hid) || (!h.hid && k.fecha === h.fecha && k.tipo === h.tipo && k.cantidad === h.cantidad && k.nota === h.nota && k.mov === h.mov));
        if (!e) return;
        x.stockActual -= signo(e.tipo) * e.cantidad;
        Object.assign(e, nuevo, { nota: nuevo.nota || e.nota }, e.mov ? { tipo: e.tipo, editado: true } : {});
        x.stockActual += signo(e.tipo) * e.cantidad;
      } else {
        x.historial.push({ hid: nuevoHid(), ...nuevo, nota: nuevo.nota || (nuevo.tipo === 'compra' ? 'Entrada manual' : 'Salida manual'), fuente: 'manual' });
        x.stockActual += signo(nuevo.tipo) * cantidad;
      }
      await DB.guardarInventario(x);
      avisar(`${x.nombre}: quedan ${cuanto(x, x.stockActual)}`);
      if (x.stockActual <= x.stockMinimo && nuevo.tipo === 'venta') avisar(`⚠️ Stock bajo: quedan ${cuanto(x, x.stockActual)} de ${x.nombre}`, null, 5000);
    });
    cola = r.catch(() => {});
    await r;
    repintar();
    return true;
  }

  // ---------- Curva de todos los productos ----------
  const COLORES = ['#e8a33d', '#3fcf8e', '#5aa9e6', '#e86a5a', '#b48ee0', '#d9c84a', '#4fc1c1', '#f08cc0'];

  function abrirCurva(items, modo = 'stock', $overlay) {
    const hoy = new Date();
    const dia = d => fechaLocal(d).slice(0, 10);
    const inicio = items.reduce((a, x) => ((x.desde || DESDE_ANTIGUO) < a ? (x.desde || DESDE_ANTIGUO) : a), dia(hoy));
    const dias = [];
    for (let d = new Date(inicio + 'T12:00:00'); dia(d) <= dia(hoy); d.setDate(d.getDate() + 1)) dias.push(dia(d));
    if (dias.length < 2) dias.unshift(dia(new Date(hoy.getTime() - 864e5)));
    const series = items.map((item, k) => {
      const valores = dias.map(f => {
        if (modo === 'ventas') return item.historial.filter(h => h.tipo === 'venta' && h.fecha === f).reduce((a, h) => a + h.cantidad, 0) / porPartes(item);
        return item.historial.filter(h => h.fecha <= f)
          .reduce((a, h) => a + (h.tipo === 'compra' ? h.cantidad : -h.cantidad), item.stockInicial) / porPartes(item);
      });
      return { item, valores, color: COLORES[k % COLORES.length] };
    });
    const W = 340, H = 200, IZQ = 30, DER = 10, ARR = 10, ABA = 22;
    const max = Math.max(1, ...series.flatMap(x => x.valores));
    const tope = max <= 4 ? 4 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
    const x = i => IZQ + i * (W - IZQ - DER) / (dias.length - 1);
    const y = v => ARR + (1 - v / tope) * (H - ARR - ABA);
    const guias = [0, tope / 2, tope].map(v => `<line x1="${IZQ}" x2="${W - DER}" y1="${y(v)}" y2="${y(v)}" class="curva-guia"/>
      <text x="${IZQ - 4}" y="${y(v) + 3}" text-anchor="end" class="curva-eje">${Math.round(v)}</text>`).join('');
    const fecha = f => f.slice(5).split('-').reverse().join('/');
    const lineas = series.map(sr => `<polyline fill="none" stroke="${sr.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"
      points="${sr.valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>
      <circle cx="${x(dias.length - 1)}" cy="${y(sr.valores[sr.valores.length - 1])}" r="3.5" fill="${sr.color}"/>`).join('');
    if (!$overlay) {
      $overlay = document.createElement('div');
      $overlay.className = 'modal-overlay';
      $overlay.addEventListener('click', e => { if (e.target === $overlay) $overlay.remove(); });
      document.body.appendChild($overlay);
    }
    $overlay.innerHTML = `
      <div class="modal">
        <h2>📈 Todos los productos</h2>
        <div class="curva-modos">
          <button type="button" data-modo="stock" class="${modo === 'stock' ? 'activo' : ''}">Stock</button>
          <button type="button" data-modo="ventas" class="${modo === 'ventas' ? 'activo' : ''}">Vendidas por día</button>
        </div>
        <svg viewBox="0 0 ${W} ${H}" class="curva" role="img" aria-label="${modo === 'stock' ? 'Stock' : 'Vendidas'} de cada producto por día">
          ${guias}${lineas}
          <text x="${IZQ}" y="${H - 6}" class="curva-eje">${fecha(dias[0])}</text>
          <text x="${W - DER}" y="${H - 6}" text-anchor="end" class="curva-eje">hoy</text>
        </svg>
        <ul class="curva-leyenda">${series.map(sr => `
          <li><i style="background:${sr.color}"></i>${escapar(sr.item.nombre)}
            <b>${modo === 'stock' ? `${cuanto(sr.item, sr.item.stockActual)} quedan` : porPartes(sr.item) > 1 ? `${cuanto(sr.item, Math.round(sr.valores.reduce((a, v) => a + v, 0) * porPartes(sr.item)))} vendidos` : (n => `${n} vendida${n === 1 ? '' : 's'}`)(sr.valores.reduce((a, v) => a + v, 0))}</b></li>`).join('')}</ul>
        <button type="button" class="hist-cerrar">Cerrar</button>
      </div>`;
    $overlay.querySelector('.hist-cerrar').addEventListener('click', () => $overlay.remove());
    $overlay.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => abrirCurva(items, b.dataset.modo, $overlay)));
  }

  const FUENTES = { voz: '🎙️ Venta anotada', venta: '🎙️ Venta anotada', manual: '✋ A mano' };

  async function abrirHistorial(item, $overlay) {
    item = (await DB.inventario()).find(i => i.id === item.id) || item;
    const frases = {};
    for (const m of await DB.todos()) frases[m.id] = m.frase || m.nota || '';
    if (!$overlay) {
      $overlay = document.createElement('div');
      $overlay.className = 'modal-overlay';
      $overlay.addEventListener('click', e => { if (e.target === $overlay) $overlay.remove(); });
      document.body.appendChild($overlay);
    }
    const filas = item.historial.map((h, i) => ({ h, i }))
      .sort((a, b) => String(b.h.fecha).localeCompare(String(a.h.fecha)) || b.i - a.i);
    $overlay.innerHTML = `
      <div class="modal">
        <h2>Historial: ${escapar(item.nombre)}</h2>
        <p class="nota">Empezó con ${cuanto(item, item.stockInicial)}, quedan ${cuanto(item, item.stockActual)}. Toca ✏️ para cambiar cantidad, fecha o nota, o 🗑️ para borrar.</p>
        <div class="hist-agregar">
          <button type="button" data-nuevo="compra">+ Agregar</button>
          <button type="button" data-nuevo="venta">− Retirar</button>
        </div>
        <div class="historial-list">
          ${filas.length ? filas.map(({ h, i }) => `
            <div class="historial-row">
              <span class="historial-tipo">${h.tipo === 'compra' ? '📥' : '📤'}</span>
              <span class="historial-texto">
                <strong>${h.tipo === 'compra' ? '+' : '−'}${cuanto(item, h.cantidad)} · ${escapar(String(h.fecha).slice(5).split('-').reverse().join('/'))}</strong>
                <small>${FUENTES[h.fuente] || FUENTES.manual}${h.mov && frases[h.mov] ? `: «${escapar(frases[h.mov])}»` : h.nota ? `: ${escapar(h.nota)}` : ''}</small>
              </span>
              <button type="button" class="hist-borrar hist-editar" data-e="${i}" aria-label="Editar">✏️</button>
              <button type="button" class="hist-borrar" data-i="${i}" aria-label="Borrar">🗑️</button>
            </div>`).join('') : '<p class="nota">Sin movimientos.</p>'}
        </div>
        <button type="button" class="hist-cerrar">Cerrar</button>
      </div>`;
    $overlay.querySelector('.hist-cerrar').addEventListener('click', () => $overlay.remove());
    $overlay.querySelectorAll('[data-nuevo]').forEach(b => b.addEventListener('click', async () => {
      if (await abrirMov(item.id, { tipo: b.dataset.nuevo })) abrirHistorial(item, $overlay);
    }));
    $overlay.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', async () => {
      if (await abrirMov(item.id, { h: item.historial[Number(b.dataset.e)] })) abrirHistorial(item, $overlay);
    }));
    $overlay.querySelectorAll('.hist-borrar[data-i]').forEach(b => b.addEventListener('click', async () => {
      const h = item.historial[Number(b.dataset.i)];
      const ok = await confirmar('¿Borrar este movimiento?',
        `${h.tipo === 'compra' ? 'Entrada' : 'Salida'} de ${cuanto(item, h.cantidad)} (${h.nota || ''}). El stock ${h.tipo === 'compra' ? 'baja' : 'sube'} ${cuanto(item, h.cantidad)}.${h.mov ? ' La venta sigue en Movimientos, pero ya no descuenta este producto.' : ''}`, 'Borrar');
      if (!ok) return;
      await quitarEntrada(item.id, h);
      repintar();
      abrirHistorial(item, $overlay);
    }));
  }

  function quitarEntrada(id, h) {
    const r = cola.then(async () => {
      const item = (await DB.inventario()).find(i => i.id === id);
      const k = item && item.historial.findIndex(x => (h.hid && x.hid === h.hid) || (x.fecha === h.fecha && x.tipo === h.tipo && x.cantidad === h.cantidad && x.nota === h.nota && x.mov === h.mov));
      if (k == null || k < 0) return;
      item.historial.splice(k, 1);
      item.stockActual += h.tipo === 'compra' ? -h.cantidad : h.cantidad;
      if (h.mov) item.ignorados = [...(item.ignorados || []), h.mov];
      await DB.guardarInventario(item);
    });
    cola = r.catch(() => {});
    return r;
  }

  function editarProducto(item) {
    const d = $('inv-editar'), f = $('inv-editar-form');
    f.nombre.value = item.nombre;
    const p0 = porPartes(item);
    f.inicial.value = +(item.stockInicial / p0).toFixed(2);
    f.minimo.value = +(item.stockMinimo / p0).toFixed(2);
    f.partes.value = p0;
    f.unidad.value = item.unidad || '';
    f.parte.value = item.parte || '';
    const verPartes = () => { $('inv-editar-partes').hidden = (parseInt(f.partes.value, 10) || 1) < 2; };
    f.partes.oninput = verPartes;
    verPartes();
    d.showModal();
    d.addEventListener('close', () => {
      if (d.returnValue !== 'guardar') return;
      const r = cola.then(async () => {
        const x = (await DB.inventario()).find(i => i.id === item.id);
        if (!x) return;
        // Cambiar en cuántas partes viene: todo lo guardado se pasa a la nueva medida.
        const pa = porPartes(x), pn = Math.max(1, Math.min(100, parseInt(f.partes.value, 10) || 1));
        if (pn !== pa) {
          const k = n => Math.round(n * pn / pa);
          x.stockActual = k(x.stockActual);
          x.stockInicial = k(x.stockInicial);
          x.historial.forEach(h => { h.cantidad = k(h.cantidad); });
        }
        x.partes = pn;
        x.unidad = f.unidad.value.trim();
        x.parte = f.parte.value.trim();
        const inicial = Math.max(0, Math.round((parseFloat(f.inicial.value) || 0) * pn));
        x.stockActual += inicial - x.stockInicial;
        x.stockInicial = inicial;
        x.stockMinimo = Math.max(0, Math.round((parseFloat(f.minimo.value) || 0) * pn));
        x.nombre = f.nombre.value.trim() || x.nombre;
        await DB.guardarInventario(x);
        avisar(`Guardado: ${x.nombre} (quedan ${cuanto(x, x.stockActual)})`);
        repintar();
      });
      cola = r.catch(() => {});
    }, { once: true });
  }

  async function agregarProducto(negocio) {
    const r = await pedir({ titulo: 'Nuevo producto', conNombre: true, textoCantidad: 'Stock inicial', cantidad: 0 });
    if (!r || !r.nombre) return;
    const nombre = r.nombre;
    const stock = r.cantidad;
    if (isNaN(stock) || stock < 0) {
      avisar('Stock inválido');
      return;
    }
    await crear(negocio, nombre, stock);
    avisar(`Producto "${nombre}" creado con ${stock} unidades`);
    repintar();
  }

  async function buscarPorConcepto(conceptoId) {
    const items = await DB.inventario();
    return items.find(i => i.conceptoId === conceptoId);
  }

  async function inicializarImportCap(negocioId) {
    // Solo la primera vez: si fer borra los productos, no vuelven a aparecer.
    const marca = 'inv-iniciado-' + negocioId;
    if (localStorage.getItem(marca)) return;
    localStorage.setItem(marca, '1');
    if ((await porNegocio(negocioId)).length) return;
    const productos = [
      { nombre: 'Excavadora RC', stock: 100 },
      { nombre: 'Volqueta RC', stock: 48 },
      { nombre: 'Bulldozer RC', stock: 24 },
      { nombre: 'Tractor RC', stock: 24 },
    ];
    for (const p of productos) await crear(negocioId, p.nombre, p.stock);
  }

  // ---------- Ventas anotadas (por voz o con frase) descuentan stock solas ----------
  // Inventarios creados antes de guardar `desde` empiezan a contar desde que fer los cargó.
  const DESDE_ANTIGUO = '2026-11-14';
  const NUMEROS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  // "Bull doser", "buldozer" y "bulldozer" quedan iguales: sin tildes, espacios ni letras repetidas, z = s.
  const plano = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/z/g, 's').replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
  // La palabra que distingue al producto: la primera de su nombre que no tienen los demás
  // ("Emblema Japón" y "Emblema Alemania" → "japon" y "aleman"; "Excavadora RC" → "excava").
  const palabrasNombre = item => item.nombre.toLowerCase().split(/\s+/).map(w => plano(w).slice(0, 6)).filter(w => w.length >= 2);
  function raiz(item, items = []) {
    const ws = palabrasNombre(item);
    const otros = new Set(items.filter(x => x.id !== item.id).flatMap(palabrasNombre));
    return ws.find(w => !otros.has(w)) || ws[0] || '';
  }

  const palabrasDe = texto => String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/);
  // La cantidad es la palabra antes del producto: "dos excavadoras" = 2; si no dice, 1.
  // Se salta "de", "el"… y las otras palabras del nombre: "2 emblemas de Japón" = 2.
  function numeroAntes(palabras, i, saltar = []) {
    let k = i - 1;
    while (k > 0 && (['de', 'del', 'la', 'el', 'los', 'las'].includes(palabras[k]) || saltar.some(r => plano(palabras[k]).startsWith(r.slice(0, 5))))) k--;
    const antes = palabras[k];
    if (antes && NUMEROS[antes]) return NUMEROS[antes];
    if (antes && /^\d{1,3}$/.test(antes)) return Number(antes);
    return 1;
  }

  function cantidadEn(texto, item, items) {
    const palabras = palabrasDe(texto);
    const r = raiz(item, items);
    const i = palabras.findIndex((w, k) => plano(w).startsWith(r) || plano(w + (palabras[k + 1] || '')).startsWith(r));
    return i < 0 ? 1 : numeroAntes(palabras, i, palabrasNombre(item).filter(w => w !== r));
  }

  // ---------- Combos ----------
  // Cada negocio guarda sus combos en el teléfono: [{ id, nombre, partes: { idProducto: cantidad } }].
  const claveCombos = negocio => 'inv-combos-' + negocio;
  function combos(negocio) {
    try { return JSON.parse(localStorage.getItem(claveCombos(negocio)) || '[]'); } catch { return []; }
  }
  function guardarCombos(negocio, lista) {
    localStorage.setItem(claveCombos(negocio), JSON.stringify(lista));
  }
  // Lo que se dice del combo: el nombre entero, o sin la palabra "combo" ("combo obra" → "obra").
  function formasCombo(c) {
    const sin = c.nombre.replace(/\b(combo|combos|pack|kit)\b/gi, '').trim();
    const frases = String(c.frases || '').split(/[,;\n]+/).map(plano);
    return [plano(c.nombre), plano(sin), ...frases].filter(f => f.length >= 3);
  }

  // Un combo dicho en la frase: los combos guardados por su nombre; "combo" a secas es el único guardado
  // o, si no hay ninguno (o hay varios), uno de cada producto. "Dos combos obra" = 2 veces el combo.
  function combosEn(texto, items, negocio) {
    const t = plano(texto), palabras = palabrasDe(texto);
    const guardados = combos(negocio).filter(c => Object.values(c.partes || {}).some(n => n > 0));
    const partesDe = (c, veces) => items.filter(i => c.partes[i.id] > 0).map(item => ({ item, cantidad: c.partes[item.id] * veces * porPartes(item) }));
    for (const c of guardados) {
      if (!formasCombo(c).some(f => t.includes(f))) continue;
      const primera = palabrasDe(c.nombre).filter(Boolean)[0];
      let i = palabras.findIndex(w => w === primera || w === primera + 's');
      if (i < 0) i = palabras.findIndex(w => w === 'combo' || w === 'combos');
      return partesDe(c, i < 0 ? 1 : numeroAntes(palabras, i));
    }
    const i = palabras.findIndex(w => w === 'combo' || w === 'combos');
    if (i < 0) return null;
    const veces = numeroAntes(palabras, i);
    if (guardados.length === 1) return partesDe(guardados[0], veces);
    return items.map(item => ({ item, cantidad: veces * porPartes(item) }));
  }

  // Lo que salió en una venta: [{ item, cantidad }] (vacío si no nombra productos).
  // Todos los productos que nombra un texto: "una excavadora y una volqueta" = 1 y 1.
  // En productos por partes: "dos usuarios" = 2 partes, "un crédito" = 1 entero; si solo nombra el producto, 1 entero.
  // Una palabra sin número delante cuenta una sola vez ("1 crédito de Créditos Magis" = 1 crédito).
  function nombrados(texto, items) {
    const t = plano(texto), palabras = palabrasDe(texto);
    const out = [];
    for (const item of items) {
      const p = porPartes(item);
      let n = 0;
      if (p > 1) {
        let sueltas = 0;
        for (const [lista, mult] of [[item.unidad, p], [item.parte, 1]]) {
          const raices = palabrasLista(lista).map(w => plano(w).slice(0, 5)).filter(r => r.length >= 3);
          const hits = palabras.map((w, i) => (w && raices.some(r => plano(w).startsWith(r)) ? i : -1)).filter(i => i >= 0);
          const conNumero = hits.filter(i => NUMEROS[palabras[i - 1]] || /^\d{1,3}$/.test(palabras[i - 1] || ''));
          n += conNumero.reduce((a, i) => a + numeroAntes(palabras, i), 0) * mult;
          if (hits.length && !sueltas) sueltas = mult;
          if (hits.length && mult === 1) sueltas = 1;
        }
        if (!n) n = sueltas;
      }
      if (!n && t.includes(raiz(item, items))) n = cantidadEn(texto, item, items) * p;
      if (n) out.push({ item, cantidad: n });
    }
    return out;
  }

  // Lo que salió en una venta: [{ item, cantidad }] (vacío si no nombra productos).
  // La nota es de esta venta; la frase entera solo se mira si de ella salió una sola venta
  // (si la IA la partió en varias, cada una ya trae su producto en la nota).
  function productosDe(m, items, sola = true) {
    for (const texto of [m.nota, m.frase]) {
      const delCombo = combosEn(texto, items, m.negocio || '');
      if (delCombo) return delCombo;
    }
    const deNota = nombrados(m.nota, items);
    if (deNota.length && !sola) return deNota;
    const deFrase = sola || !deNota.length ? nombrados(m.frase, items) : [];
    const todos = new Map();
    for (const p of [...deNota, ...deFrase]) {
      const ya = todos.get(p.item.id);
      if (!ya || p.cantidad > ya.cantidad) todos.set(p.item.id, p);
    }
    return [...todos.values()];
  }

  // Cuántas ventas salieron de cada frase.
  function ventasPorFrase(movs) {
    const n = {};
    for (const m of movs) if (m.tipo === 'ingreso' && m.frase) n[m.frase] = (n[m.frase] || 0) + 1;
    return n;
  }


  // Cuadra el stock con las ventas del negocio: agrega las nuevas y devuelve las que se borraron o cambiaron.
  // Una sincronización a la vez, para no descontar dos veces la misma venta.
  let cola = Promise.resolve();
  function sincronizar(negocio) {
    const r = cola.then(() => cuadrar(negocio));
    cola = r.catch(() => {});
    return r;
  }

  async function cuadrar(negocio) {
    const items = await porNegocio(negocio);
    if (!items.length) return [];
    const desdeMin = items.reduce((a, x) => ((x.desde || DESDE_ANTIGUO) < a ? (x.desde || DESDE_ANTIGUO) : a), '9999');
    const conceptos = {};
    for (const c of await DB.conceptos()) conceptos[c.id] = c;
    const quiere = new Map();
    const todosMovs = await DB.todos();
    const porFrase = ventasPorFrase(todosMovs.filter(m => (m.negocio || '') === negocio));
    for (const m of todosMovs) {
      if ((m.negocio || '') !== negocio || m.estado === 'pendiente' || m.tipo !== 'ingreso') continue;
      if (String(m.fecha).slice(0, 10) < desdeMin) continue;
      const ps = productosDe(m, items, (porFrase[m.frase] || 0) <= 1).filter(p => String(m.fecha).slice(0, 10) >= (p.item.desde || DESDE_ANTIGUO) && !ignorado(p.item, m.id));
      if (ps.length) quiere.set(m.id, ps.map(p => ({ ...p, m })));
    }
    const bajos = [];
    for (const item of items) {
      let cambio = false;
      const antes = item.stockActual;
      for (const h of item.historial) if (!h.hid) { h.hid = nuevoHid(); cambio = true; }
      item.historial = item.historial.filter(h => {
        if (!h.mov) return true;
        const q = (quiere.get(h.mov) || []).find(x => x.item.id === item.id);
        if (q && (q.cantidad === h.cantidad || h.editado)) return true;
        item.stockActual += h.cantidad;
        cambio = true;
        return false;
      });
      for (const [id, lista] of quiere) {
        const q = lista.find(x => x.item.id === item.id);
        if (!q || item.historial.some(h => h.mov === id)) continue;
        item.historial.push({ hid: nuevoHid(), fecha: String(q.m.fecha).slice(0, 10), tipo: 'venta', cantidad: q.cantidad,
          nota: q.m.nota || q.m.frase || 'Venta', fuente: 'venta', mov: id });
        item.stockActual -= q.cantidad;
        cambio = true;
      }
      if (cambio) {
        await DB.guardarInventario(item);
        if (item.stockActual <= item.stockMinimo && antes > item.stockMinimo) bajos.push(item);
      }
    }
    return bajos;
  }

  async function avisarBajos(negocio) {
    const bajos = await sincronizar(negocio);
    if (bajos.length) avisar(`⚠️ Stock bajo: ${bajos.map(b => `${b.nombre} (${cuanto(b, b.stockActual)})`).join(', ')}`, null, 5000);
  }

  // ---------- Importar ventas de un Excel (o CSV) ----------
  // Lee una hoja de ventas (precio, descripción, cantidad y, si hay, fecha), arma los productos
  // que nombra y anota cada venta en el negocio. Volver a importar la misma hoja no duplica.
  const RELLENO = ['de', 'del', 'el', 'la', 'los', 'las', 'y', 'un', 'una', 'en', 'con', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const aNumero = v => {
    const t = String(v ?? '').replace(/[$\s]/g, '');
    if (!t) return NaN;
    return Number(t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.'));
  };

  function leerCSV(texto) {
    const sep = (texto.split('\n')[0].match(/;/g) || []).length > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return texto.split(/\r?\n/).map(linea => {
      const celdas = [];
      let cur = '', comillas = false;
      for (const ch of linea) {
        if (ch === '"') comillas = !comillas;
        else if (ch === sep && !comillas) { celdas.push(cur); cur = ''; } else cur += ch;
      }
      celdas.push(cur);
      return celdas;
    });
  }

  function fechaDe(v) {
    const t = String(v || '').trim();
    if (/^\d{5}(\.\d+)?$/.test(t)) return fechaLocal(new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 864e5 + 12 * 36e5)).slice(0, 10);
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }

  function analizarVentas(filas) {
    const texto = v => String(v ?? '').trim();
    const ini = filas.findIndex(f => f && f.filter(v => texto(v) && isNaN(aNumero(v))).length >= 2);
    if (ini < 0) throw new Error('No encontré los títulos de las columnas');
    const cab = filas[ini].map(v => plano(v));
    const datos = filas.slice(ini + 1).filter(f => f && f.some(v => texto(v)));
    const busca = re => cab.findIndex(h => re.test(h));
    const colCant = busca(/^cant/);
    const colDesc = busca(/descri|detal|product|articul|concept|nota/);
    const colFecha = busca(/fecha|^dia/);
    const usadas = [colCant, colDesc, colFecha];
    const numericas = cab.map((_, k) => (usadas.includes(k) ? -1 : datos.filter(f => aNumero(f[k]) > 0).length));
    let colMonto = busca(/monto|precio|valor|importe|cobr|pago|venta/);
    const mejor = numericas.indexOf(Math.max(...numericas));
    if (colMonto < 0 || numericas[colMonto] < numericas[mejor] / 2) colMonto = mejor;
    if (colMonto < 0 || colDesc < 0) throw new Error('No encontré las columnas de precio y descripción');
    const ventas = datos.map((f, k) => ({ fila: ini + 2 + k, monto: aNumero(f[colMonto]), desc: texto(f[colDesc]),
      cantidad: colCant >= 0 ? Math.max(1, Math.round(aNumero(f[colCant])) || 1) : null, fecha: colFecha >= 0 ? fechaDe(f[colFecha]) : '' }))
      .filter(v => v.monto > 0);
    // Palabra de tipo ("Emblema"): la primera palabra más común; se quita del nombre del producto.
    const primeras = {};
    for (const v of ventas) {
      const w = palabrasDe(v.desc).find(x => x && !/^\d+$/.test(x));
      if (w) primeras[plano(w).slice(0, 5)] = (primeras[plano(w).slice(0, 5)] || 0) + 1;
    }
    const [tipoClave, tipoN] = Object.entries(primeras).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const tipo = tipoN >= ventas.length * 0.4 ? tipoClave : '';
    const esTipo = w => tipo && plano(w).startsWith(tipo);
    const grupos = new Map();
    for (const v of ventas) {
      const orig = v.desc.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const ws = orig.map(w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
      const encontrados = [];
      ws.forEach((w, i) => {
        if (/^\d+$/.test(w) || NUMEROS[w] || RELLENO.includes(w) || esTipo(w) || plano(w).length < 2) return;
        let k = i - 1;
        while (k >= 0 && RELLENO.includes(ws[k])) k--;
        const antes = ws[k];
        // Tras "emblema" es producto; tras un número solo si la fila habla del tipo ("2 emblemas Japón 1 de EEUU"),
        // así "venta 4 noviembre" no crea el producto "Noviembre".
        const tieneTipo = !tipo || ws.some(esTipo);
        const fuerte = antes !== undefined && (esTipo(antes) || (tieneTipo && (/^\d+$/.test(antes) || NUMEROS[antes])));
        if (!fuerte && i !== 0) return;
        let q = null;
        let j = k;
        while (j >= 0 && (esTipo(ws[j]) || RELLENO.includes(ws[j]))) j--;
        if (ws[j] && /^\d{1,3}$/.test(ws[j])) q = Number(ws[j]);
        else if (ws[j] && NUMEROS[ws[j]]) q = NUMEROS[ws[j]];
        else if (ws[i + 1] && /^\d{1,3}$/.test(ws[i + 1])) q = Number(ws[i + 1]);
        encontrados.push({ clave: plano(w).slice(0, 3), palabra: orig[i], q, fuerte });
      });
      const unicos = [...new Map(encontrados.map(e => [e.clave, e])).values()];
      v.partes = unicos.map(e => ({ clave: e.clave, cantidad: unicos.length === 1 ? (v.cantidad || e.q || 1) : (e.q || 1) }));
      for (const e of unicos) {
        const g = grupos.get(e.clave) || { clave: e.clave, formas: {}, fuerte: false, vendidos: 0, ventas: 0 };
        g.formas[e.palabra] = (g.formas[e.palabra] || 0) + 1;
        g.fuerte = g.fuerte || e.fuerte;
        g.vendidos += v.partes.find(p => p.clave === e.clave).cantidad;
        g.ventas++;
        grupos.set(e.clave, g);
      }
    }
    const tipoNombre = (() => {
      const formas = {};
      for (const v of ventas) for (const w of v.desc.split(/[^\p{L}]+/u)) if (esTipo(w)) formas[w] = (formas[w] || 0) + 1;
      const w = Object.keys(formas).sort((a, b) => a.length - b.length || formas[b] - formas[a])[0] || '';
      return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
    })();
    for (const g of grupos.values()) {
      const formas = Object.entries(g.formas).sort((a, b) => b[1] - a[1]);
      const conTilde = formas.find(([w]) => /[áéíóúñ]/i.test(w) && plano(w) === plano(formas[0][0]));
      let w = (conTilde || formas[0])[0];
      if (w === w.toLowerCase()) w = w[0].toUpperCase() + w.slice(1);
      g.nombre = (tipoNombre ? tipoNombre + ' ' : '') + w;
    }
    return { ventas, grupos: [...grupos.values()].sort((a, b) => b.vendidos - a.vendidos), colFecha: colFecha >= 0,
      columnas: { monto: filas[ini][colMonto], desc: filas[ini][colDesc], cant: colCant >= 0 ? filas[ini][colCant] : '' } };
  }

  async function importarVentas(negocio, archivo) {
    let a;
    try {
      const filas = /\.csv$/i.test(archivo.name) ? leerCSV(await archivo.text()) : await Excel.leerHoja(await archivo.arrayBuffer());
      a = analizarVentas(filas || []);
    } catch (e) {
      avisar('No se pudo leer: ' + (e.message || 'archivo raro'), null, 6000);
      return;
    }
    if (!a.ventas.length) { avisar('No encontré ventas en ese archivo', null, 5000); return; }
    const items = await porNegocio(negocio);
    for (const g of a.grupos) g.existe = items.find(i => palabrasNombre(i).some(w => w.startsWith(g.clave)));
    const total = a.ventas.reduce((s, v) => s + v.monto, 0);
    const hoy = fechaLocal().slice(0, 10);
    const $o = document.createElement('div');
    $o.className = 'modal-overlay';
    document.body.appendChild($o);
    $o.innerHTML = `
      <form class="modal inv-importar">
        <h2>📥 Importar ventas</h2>
        <p class="nota">Encontré <b>${a.ventas.length} ventas</b> por <b>${dinero(Math.round(total * 100))}</b>.
          Precio: «${escapar(a.columnas.monto)}», descripción: «${escapar(a.columnas.desc)}»${a.columnas.cant ? `, cantidad: «${escapar(a.columnas.cant)}»` : ''}.</p>
        ${a.colFecha ? '<p class="nota">Las fechas salen de la hoja.</p>' : `<label>¿Qué día anoto estas ventas?<input type="date" name="fecha" value="${hoy}" max="${hoy}"></label>`}
        <h3>Productos</h3>
        <p class="nota">Marca los que son productos de verdad. A los nuevos dime cuántos te quedan hoy: el stock inicial será eso más lo vendido.</p>
        <div class="imp-lista">${a.grupos.map((g, k) => `
          <div class="imp-fila">
            <label class="imp-marca"><input type="checkbox" name="usar${k}" ${g.fuerte || g.existe ? 'checked' : ''}></label>
            <div class="imp-datos">
              ${g.existe ? `<strong>${escapar(g.existe.nombre)}</strong><small>ya está · quedan ${escapar(cuanto(g.existe, g.existe.stockActual))}</small>`
                : `<input name="nombre${k}" value="${escapar(g.nombre)}" maxlength="40">`}
              <small>${g.vendidos} vendidos en ${g.ventas} venta${g.ventas === 1 ? '' : 's'}</small>
            </div>
            ${g.existe ? '' : `<label class="imp-quedan">Quedan<input type="number" name="quedan${k}" min="0" step="1" inputmode="numeric" value="0"></label>`}
          </div>`).join('')}</div>
        <p class="nota" id="imp-sin"></p>
        <div class="editor-botones">
          <button type="button" value="no">Cancelar</button>
          <button type="submit" class="principal">Importar</button>
        </div>
      </form>`;
    const f = $o.querySelector('form');
    const usar = () => a.grupos.filter((g, k) => f[`usar${k}`].checked);
    const pintarSin = () => {
      const claves = new Set(usar().map(g => g.clave));
      const sin = a.ventas.filter(v => !v.partes.some(p => claves.has(p.clave)));
      $o.querySelector('#imp-sin').textContent = sin.length
        ? `${sin.length} venta${sin.length === 1 ? '' : 's'} sin producto (por ejemplo «${sin[0].desc || 'sin descripción'}»): se anotan igual como venta, sin tocar el stock.` : '';
    };
    f.addEventListener('change', pintarSin);
    pintarSin();
    const ok = await new Promise(r => {
      $o.querySelector('[value=no]').addEventListener('click', () => r(false));
      f.addEventListener('submit', e => { e.preventDefault(); r(true); });
    });
    const fechaElegida = (f.fecha && f.fecha.value) || hoy;
    const elegidos = usar().map(g => ({ g, k: a.grupos.indexOf(g) }));
    $o.remove();
    if (!ok) return;

    const conceptos = (await DB.conceptos()).filter(c => (c.negocio || '') === negocio && c.tipo === 'ingreso' && !c.oculto);
    const concepto = conceptos.find(c => /venta/i.test(c.nombre) || /ventas$/.test(c.id)) || conceptos[0];
    if (!concepto) { avisar('Este negocio no tiene un concepto de ventas', null, 5000); return; }
    const fechas = a.ventas.map(v => v.fecha || fechaElegida).sort();
    const desde = fechas[0] || fechaElegida;
    // Productos: los nuevos se crean con stock inicial = quedan + vendidos.
    const producto = {};
    for (const { g, k } of elegidos) {
      if (g.existe) {
        if ((g.existe.desde || DESDE_ANTIGUO) > desde) { g.existe.desde = desde; await DB.guardarInventario(g.existe); }
        producto[g.clave] = g.existe;
        continue;
      }
      const nombre = (f[`nombre${k}`].value || g.nombre).trim();
      const quedan = Math.max(0, parseInt(f[`quedan${k}`].value, 10) || 0);
      const it = await crear(negocio, nombre, quedan + g.vendidos);
      it.desde = desde;
      await DB.guardarInventario(it);
      producto[g.clave] = it;
    }
    const hash = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
    const ahora = new Date().toISOString();
    for (const v of a.ventas) {
      const partes = v.partes.filter(p => producto[p.clave]);
      const nota = partes.length ? partes.map(p => `${p.cantidad} ${producto[p.clave].nombre}`).join(' y ') : v.desc;
      await DB.guardar({ id: 'imp-' + hash(`${negocio}|${v.fila}|${v.desc}|${v.monto}`), tipo: 'ingreso', monto: Math.round(v.monto * 100), moneda: 'USD',
        concepto: concepto.id, fecha: `${v.fecha || fechaElegida}T12:00:00`, nota, frase: '', original: v.desc, negocio,
        estado: 'listo', ms: null, creado: ahora, editado: ahora, importado: true });
    }
    await sincronizar(negocio);
    avisar(`Importadas ${a.ventas.length} ventas y ${elegidos.length} productos ✓`, null, 5000);
    repintar();
  }

  return {
    crear,
    registrarMovimiento,
    porNegocio,
    pintar,
    agregarProducto,
    inicializarImportCap,
    sincronizar,
    combos,
    importarVentas,
    cuanto,
    porPartes,
    palabrasLista,
    avisarBajos,
  };
})();
