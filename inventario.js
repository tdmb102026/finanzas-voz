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

  async function pintar(negocio, padre = '#inventario') {
    const items = await porNegocio(negocio);
    const $div = $(padre);
    if (!$div) return;
    $div.innerHTML = '';

    if (!items.length) {
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

  async function restarStock(id) {
    const items = await DB.inventario();
    const item = items.find(i => i.id === id);
    if (!item) return;
    const cantidad = prompt(`Restar stock de "${item.nombre}". ¿Cuántas unidades? (actual: ${item.stockActual})`);
    if (!cantidad) return;
    const q = parseInt(cantidad);
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
    const cantidad = prompt(`Agregar stock de "${item.nombre}". ¿Cuántas unidades? (actual: ${item.stockActual})`);
    if (!cantidad) return;
    const q = parseInt(cantidad);
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
    const nombre = prompt('Nombre del producto:');
    if (!nombre) return;
    const stockIni = prompt(`Stock inicial de "${nombre}":`, '0');
    if (!stockIni) return;
    const stock = parseInt(stockIni);
    if (isNaN(stock) || stock < 0) {
      avisar('Stock inválido');
      return;
    }
    await crear(negocio, nombre, stock);
    avisar(`Producto "${nombre}" creado con ${stock} unidades`);
    repintar();
  }

  return {
    crear,
    registrarMovimiento,
    porNegocio,
    pintar,
    agregarProducto,
  };
})();
