// Módulo Inventario: gestiona stock de productos en un negocio.
// Uso: crear productos, registrar movimientos (compras/ventas), ver historial.

const Inventario = (() => {
  const STOCK_MINIMO_DEFAULT = 10;
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
    for (const m of await DB.todos()) {
      if ((m.negocio || '') !== negocio || m.estado === 'pendiente' || (m.tipo !== 'ingreso' && m.tipo !== 'gasto')) continue;
      const dia = String(m.fecha).slice(0, 10);
      const ps = productosDe(m, items).filter(p => dia >= (p.item.desde || DESDE_ANTIGUO));
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
          <p class="inventario-vendidas">Vendidas este mes: ${vendidas(item)} · <b class="inv-plata">${dinero(pl.ventasMes - pl.gastosMes)}</b>${alerta ? ' · ⚠️ stock bajo' : ''}<span class="inv-flecha">›</span></p>
        </summary>
        <div class="inv-detalle">
          <div class="inv-datos">
            <div><strong>${item.stockInicial}</strong><small>al empezar</small></div>
            <div><strong>+${entraron}</strong><small>entraron</small></div>
            <div><strong>−${salieron}</strong><small>salieron</small></div>
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
            <button type="button" class="inv-menos" data-id="${escapar(item.id)}">− Salida</button>
            <button type="button" class="inv-mas" data-id="${escapar(item.id)}">+ Entrada</button>
            <button type="button" class="inv-hist" data-id="${escapar(item.id)}">Todo</button>
          </div>
        </div>
      `;
      $div.appendChild($card);
    });

    // Event listeners
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

  async function abrirHistorial(item) {
    const $overlay = document.createElement('div');
    $overlay.className = 'modal-overlay';
    const $modal = document.createElement('div');
    $modal.className = 'modal';

    const $title = document.createElement('h2');
    $title.textContent = `Historial: ${item.nombre}`;
    $modal.appendChild($title);

    const $list = document.createElement('div');
    $list.className = 'historial-list';

    if (item.historial.length === 0) {
      $list.innerHTML = '<p style="text-align: center; color: var(--suave);">Sin movimientos</p>';
    } else {
      item.historial.reverse().forEach(h => {
        const $row = document.createElement('div');
        $row.className = 'historial-row';
        $row.innerHTML = `
          <span class="historial-fecha">${escapar(h.fecha)}</span>
          <span class="historial-tipo">${h.tipo === 'compra' ? '📥' : '📤'}</span>
          <span class="historial-cantidad">${h.cantidad} unidades</span>
          <span class="historial-nota">${escapar(h.nota)}</span>
        `;
        $list.appendChild($row);
      });
    }
    $modal.appendChild($list);

    const $btn = document.createElement('button');
    $btn.type = 'button';
    $btn.textContent = 'Cerrar';
    $btn.addEventListener('click', () => $overlay.remove());
    $modal.appendChild($btn);

    $overlay.appendChild($modal);
    document.body.appendChild($overlay);
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
    const existentes = await porNegocio(negocioId);
    console.log(`[Inventario.inicializarImportCap] negocioId=${negocioId}, existentes=${existentes.length}`);
    if (existentes.length > 0) {
      console.log(`[Inventario.inicializarImportCap] Ya existen productos, no se crean`);
      return;
    }

    const productos = [
      { nombre: 'Excavadora RC', stock: 100 },
      { nombre: 'Volqueta RC', stock: 48 },
      { nombre: 'Bulldozer RC', stock: 24 },
      { nombre: 'Tractor RC', stock: 24 },
    ];

    console.log(`[Inventario.inicializarImportCap] Creando ${productos.length} productos...`);
    for (const p of productos) {
      await crear(negocioId, p.nombre, p.stock);
      console.log(`[Inventario.inicializarImportCap] Creado: ${p.nombre}`);
    }
    console.log(`[Inventario.inicializarImportCap] Todos los productos creados`);
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

  // Un combo es uno de cada producto del negocio: "vendí dos combos" saca 2 de cada uno.
  function esCombo(texto) {
    const palabras = palabrasDe(texto);
    const i = palabras.findIndex(w => w === 'combo' || w === 'combos');
    return i < 0 ? 0 : numeroAntes(palabras, i);
  }

  // Lo que salió en una venta: [{ item, cantidad }] (vacío si no nombra productos).
  function productosDe(m, items) {
    for (const texto of [m.nota, m.frase]) {
      const combos = esCombo(texto);
      if (combos) return items.map(item => ({ item, cantidad: combos }));
      const t = plano(texto);
      const item = items.find(x => t.includes(raiz(x)));
      if (item) return [{ item, cantidad: cantidadEn(texto, item) }];
    }
    return [];
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
    for (const m of await DB.todos()) {
      if ((m.negocio || '') !== negocio || m.estado === 'pendiente' || m.tipo !== 'ingreso') continue;
      if (String(m.fecha).slice(0, 10) < desdeMin) continue;
      const ps = productosDe(m, items).filter(p => String(m.fecha).slice(0, 10) >= (p.item.desde || DESDE_ANTIGUO));
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
    avisarBajos,
  };
})();
