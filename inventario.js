// Módulo Inventario: gestiona stock de productos en un negocio.
// Uso: crear productos, registrar movimientos (compras/ventas), ver historial.

const Inventario = (() => {
  const STOCK_MINIMO_DEFAULT = 10;

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
    const fecha = ahora.toISOString().split('T')[0];
    const entrada = { fecha, tipo, cantidad, nota, fuente };
    item.historial.push(entrada);

    // Actualizar stock
    if (tipo === 'compra') item.stockActual += cantidad;
    else if (tipo === 'venta') item.stockActual = Math.max(0, item.stockActual - cantidad);

    await DB.guardarInventario(item);
    return item;
  }

  async function pintar(negocio, padre = 'inventario') {
    console.log(`[Inventario.pintar] negocio=${negocio}, padre=${padre}`);
    const items = await porNegocio(negocio);
    console.log(`[Inventario.pintar] items encontrados:`, items.length);
    const $div = $(padre);
    if (!$div) {
      console.log(`[Inventario.pintar] $div no encontrado para ${padre}`);
      return;
    }
    $div.innerHTML = '';

    if (!items.length) {
      console.log(`[Inventario.pintar] Sin productos para este negocio`);
      $div.innerHTML = '<p style="text-align: center; color: var(--suave);">Sin productos. Agregar uno arriba.</p>';
      return;
    }

    items.forEach(item => {
      const alerta = item.stockActual <= item.stockMinimo;
      const $card = document.createElement('div');
      $card.className = 'inventario-card' + (alerta ? ' alerta' : '');
      $card.innerHTML = `
        <div class="inventario-header">
          <span class="inventario-nombre">${escapar(item.nombre)}</span>
          <span class="inventario-stock${alerta ? ' stock-bajo' : ''}">${item.stockActual} unidades</span>
        </div>
        <div class="inventario-acciones">
          <button type="button" class="inv-menos" data-id="${escapar(item.id)}">−</button>
          <button type="button" class="inv-mas" data-id="${escapar(item.id)}">+</button>
          <button type="button" class="inv-hist" data-id="${escapar(item.id)}">Historial</button>
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

  async function registrarVentaPorVoz(conceptoNombre, cantidad, negocio) {
    const items = await porNegocio(negocio);
    const item = items.find(i => i.nombre.toLowerCase().includes(conceptoNombre.toLowerCase().split(' ')[0]));
    if (item) {
      return await registrarMovimiento(item.id, 'venta', cantidad, `Venta por voz`, 'voz');
    }
    return null;
  }

  return {
    crear,
    registrarMovimiento,
    porNegocio,
    pintar,
    agregarProducto,
    inicializarImportCap,
    registrarVentaPorVoz,
  };
})();
