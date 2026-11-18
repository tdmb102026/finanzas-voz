// Módulo Inventario: gestiona stock de productos en un negocio.
// Uso: crear productos, registrar movimientos (compras/ventas), ver historial.

const Inventario = (() => {
  const STOCK_MINIMO_DEFAULT = 10;
  // Ventas que fer quitó del historial: ya no descuentan ese producto.
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
    const entrada = { fecha, tipo, cantidad, nota, fuente };
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
    const total = items.reduce((a, x) => a + x.stockActual, 0);
    const vendidasMes = items.reduce((a, x) => a + vendidas(x), 0);
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
      <div><strong>${total}</strong><small>unidades en bodega</small></div>
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
    $div.appendChild($todo);

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
            <span class="inventario-stock${alerta ? ' stock-bajo' : ''}"><strong>${item.stockActual}</strong> de ${tope}</span>
          </div>
          <div class="inv-barra${alerta ? ' baja' : ''}"><i style="width:${pct}%"></i></div>
          <div class="inv-pie">
            <p class="inventario-vendidas">Vendidas este mes: ${vendidas(item)} · <b class="inv-plata">${dinero(pl.ventasMes - pl.gastosMes)}</b>${alerta ? '<br>⚠️ stock bajo' : ''}</p>
            <span class="inv-paso">
              <button type="button" class="inv-uno" data-id="${escapar(item.id)}" data-tipo="venta" aria-label="Sacar uno">−</button>
              <button type="button" class="inv-uno" data-id="${escapar(item.id)}" data-tipo="compra" aria-label="Agregar uno">+</button>
            </span>
            <span class="inv-flecha">›</span>
          </div>
        </summary>
        <div class="inv-detalle">
          <div class="inv-datos">
            <div><strong>${item.stockInicial}</strong><small>al empezar</small></div>
            <div><strong>+${entraron}</strong><small>entraron</small></div>
            <div><strong>${salieron ? `−${salieron}` : 0}</strong><small>salieron</small></div>
            <div><strong>${porSemana ? porSemana.toFixed(1).replace('.0', '') : '0'}</strong><small>por semana</small></div>
          </div>
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
            <li><span>${h.tipo === 'compra' ? '📥' : '📤'} ${h.tipo === 'compra' ? '+' : '−'}${h.cantidad}</span>
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
      avisar(`${item.nombre}: ${tipo === 'venta' ? '−1' : '+1'} → quedan ${item.stockActual}`, () => deshacerUno(id));
      if (tipo === 'venta' && item.stockActual === item.stockMinimo) avisar(`⚠️ Stock bajo: quedan ${item.stockActual} de ${item.nombre}`, () => deshacerUno(id), 5000);
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

  async function restarStock(id) {
    const items = await DB.inventario();
    const item = items.find(i => i.id === id);
    if (!item) return;
    const r = await pedir({ titulo: `Vender ${item.nombre}`, nota: `Hay ${item.stockActual} unidades.`, textoCantidad: '¿Cuántas salen?', cantidad: 1 });
    if (!r) return;
    const q = r.cantidad;
    if (q > 0) {
      await registrarMovimiento(id, 'venta', q, `Venta manual`);
      avisar(`Vendidas ${q} unidades de ${item.nombre}`);
      const nuevoStock = item.stockActual - q;
      if (nuevoStock <= item.stockMinimo) avisar(`⚠️ Stock bajo: quedan ${nuevoStock}`, null, 5000);
      repintar();
    }
  }

  async function sumarStock(id) {
    const items = await DB.inventario();
    const item = items.find(i => i.id === id);
    if (!item) return;
    const r = await pedir({ titulo: `Agregar ${item.nombre}`, nota: `Hay ${item.stockActual} unidades.`, textoCantidad: '¿Cuántas entran?', cantidad: 1 });
    if (!r) return;
    const q = r.cantidad;
    if (q > 0) {
      await registrarMovimiento(id, 'compra', q, `Compra manual`);
      avisar(`Agregadas ${q} unidades de ${item.nombre}`);
      repintar();
    }
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
        <p class="nota">Empezó con ${item.stockInicial}. Si algo está mal (por ejemplo la voz entendió otro producto), bórralo con 🗑️ y el stock se corrige.</p>
        <div class="historial-list">
          ${filas.length ? filas.map(({ h, i }) => `
            <div class="historial-row">
              <span class="historial-tipo">${h.tipo === 'compra' ? '📥' : '📤'}</span>
              <span class="historial-texto">
                <strong>${h.tipo === 'compra' ? '+' : '−'}${h.cantidad} · ${escapar(String(h.fecha).slice(5).split('-').reverse().join('/'))}</strong>
                <small>${FUENTES[h.fuente] || FUENTES.manual}${h.mov && frases[h.mov] ? `: «${escapar(frases[h.mov])}»` : h.nota ? `: ${escapar(h.nota)}` : ''}</small>
              </span>
              <button type="button" class="hist-borrar" data-i="${i}" aria-label="Borrar">🗑️</button>
            </div>`).join('') : '<p class="nota">Sin movimientos.</p>'}
        </div>
        <button type="button" class="hist-cerrar">Cerrar</button>
      </div>`;
    $overlay.querySelector('.hist-cerrar').addEventListener('click', () => $overlay.remove());
    $overlay.querySelectorAll('.hist-borrar').forEach(b => b.addEventListener('click', async () => {
      const h = item.historial[Number(b.dataset.i)];
      const ok = await confirmar('¿Borrar este movimiento?',
        `${h.tipo === 'compra' ? 'Entrada' : 'Salida'} de ${h.cantidad} (${h.nota || ''}). El stock ${h.tipo === 'compra' ? 'baja' : 'sube'} ${h.cantidad}.${h.mov ? ' La venta sigue en Movimientos, pero ya no descuenta este producto.' : ''}`, 'Borrar');
      if (!ok) return;
      await quitarEntrada(item.id, h);
      repintar();
      abrirHistorial(item, $overlay);
    }));
  }

  function quitarEntrada(id, h) {
    const r = cola.then(async () => {
      const item = (await DB.inventario()).find(i => i.id === id);
      const k = item && item.historial.findIndex(x => x === h || (x.fecha === h.fecha && x.tipo === h.tipo && x.cantidad === h.cantidad && x.nota === h.nota && x.mov === h.mov));
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
    f.inicial.value = item.stockInicial;
    f.minimo.value = item.stockMinimo;
    d.showModal();
    d.addEventListener('close', () => {
      if (d.returnValue !== 'guardar') return;
      const r = cola.then(async () => {
        const x = (await DB.inventario()).find(i => i.id === item.id);
        if (!x) return;
        const inicial = Math.max(0, parseInt(f.inicial.value, 10) || 0);
        x.stockActual += inicial - x.stockInicial;
        x.stockInicial = inicial;
        x.stockMinimo = Math.max(0, parseInt(f.minimo.value, 10) || 0);
        x.nombre = f.nombre.value.trim() || x.nombre;
        await DB.guardarInventario(x);
        avisar(`Guardado: ${x.nombre} (quedan ${x.stockActual})`);
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
  const raiz = item => plano(item.nombre.toLowerCase().split(/\s+/)[0]).slice(0, 6);

  const palabrasDe = texto => String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/);
  // La cantidad es la palabra antes del producto: "dos excavadoras" = 2; si no dice, 1.
  function numeroAntes(palabras, i) {
    const antes = palabras[i - 1];
    if (antes && NUMEROS[antes]) return NUMEROS[antes];
    if (antes && /^\d{1,3}$/.test(antes)) return Number(antes);
    return 1;
  }

  function cantidadEn(texto, item) {
    const palabras = palabrasDe(texto);
    const r = raiz(item);
    return numeroAntes(palabras, palabras.findIndex((w, k) => plano(w).startsWith(r) || plano(w + (palabras[k + 1] || '')).startsWith(r)));
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
    const partesDe = (c, veces) => items.filter(i => c.partes[i.id] > 0).map(item => ({ item, cantidad: c.partes[item.id] * veces }));
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
    return items.map(item => ({ item, cantidad: veces }));
  }

  // Lo que salió en una venta: [{ item, cantidad }] (vacío si no nombra productos).
  // Todos los productos que nombra un texto: "una excavadora y una volqueta" = 1 y 1.
  function nombrados(texto, items) {
    const t = plano(texto);
    return items.filter(x => t.includes(raiz(x))).map(item => ({ item, cantidad: cantidadEn(texto, item) }));
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
      item.historial = item.historial.filter(h => {
        if (!h.mov) return true;
        const q = (quiere.get(h.mov) || []).find(x => x.item.id === item.id);
        if (q && q.cantidad === h.cantidad) return true;
        item.stockActual += h.cantidad;
        cambio = true;
        return false;
      });
      for (const [id, lista] of quiere) {
        const q = lista.find(x => x.item.id === item.id);
        if (!q || item.historial.some(h => h.mov === id)) continue;
        item.historial.push({ fecha: String(q.m.fecha).slice(0, 10), tipo: 'venta', cantidad: q.cantidad,
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
    if (bajos.length) avisar(`⚠️ Stock bajo: ${bajos.map(b => `${b.nombre} (${b.stockActual})`).join(', ')}`, null, 5000);
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
    avisarBajos,
  };
})();
