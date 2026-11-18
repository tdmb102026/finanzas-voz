// Respaldo: el Excel que se descarga trae una hoja «Respaldo» con todo lo de la app
// (movimientos, conceptos, negocios, deudas, inventario, combos…). Importarlo deja la app igual.
// También una imagen con lo más importante del mes.
const Respaldo = (() => {
  const HOJA = 'Respaldo';
  const TROZO = 30000; // una celda de Excel aguanta hasta 32767 letras
  const NO_COPIAR = ['voz-clave']; // la contraseña no va en el archivo

  async function datos() {
    const tablas = {};
    for (const t of DB.TABLAS) tablas[t] = await DB.todosDe(t);
    const local = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!NO_COPIAR.includes(k)) local[k] = localStorage.getItem(k);
      }
    } catch { /* sin almacenamiento */ }
    return { app: 'MIG', version: typeof APP_VERSION === 'string' ? APP_VERSION : '', fecha: fechaLocal(), tablas, local };
  }

  // Hojas extra del Excel: el inventario para leer y el respaldo (texto que la app vuelve a leer).
  async function hojas() {
    const d = await datos();
    const negocios = Object.fromEntries(d.tablas.negocios.map(n => [n.id, n.nombre]));
    const inv = [['Negocio', 'Producto', 'Quedan', 'Stock inicial', 'Aviso stock bajo']];
    for (const i of d.tablas.inventario) {
      const n = v => (Inventario.porPartes(i) === 1 ? v : Inventario.cuanto(i, v));
      inv.push([negocios[i.negocio] || 'Personal', i.nombre, n(i.stockActual), n(i.stockInicial), n(i.stockMinimo)]);
    }
    const json = JSON.stringify(d);
    const filas = [['Respaldo de MIG del ' + d.fecha.slice(0, 10) + '. No cambies esta hoja: sirve para Importar respaldo.']];
    for (let k = 0; k < json.length; k += TROZO) filas.push([json.slice(k, k + TROZO)]);
    return [{ nombre: 'Inventario', filas: inv }, { nombre: HOJA, filas }];
  }

  // Guarda un archivo: en la app Android va a Descargas desde Java; en el navegador, descarga normal.
  function guardarArchivo(blob, nombre) {
    if (window.AndroidVoz) {
      const lector = new FileReader();
      lector.onload = () => AndroidVoz.guardar(lector.result.split(',')[1], nombre, blob.type);
      lector.readAsDataURL(blob);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Importar ----------
  async function leer(archivo) {
    const col = await Excel.leerColumna(await archivo.arrayBuffer(), HOJA);
    if (!col) throw new Error('Este Excel no tiene la hoja «Respaldo». Usa uno descargado con «Excel» desde la app.');
    const d = JSON.parse(col.slice(1).join(''));
    if (!d || d.app !== 'MIG' || !d.tablas) throw new Error('El respaldo está dañado.');
    return d;
  }

  async function aplicar(d) {
    for (const t of DB.TABLAS) await DB.reemplazar(t, d.tablas[t] || []);
    try {
      for (const [k, v] of Object.entries(d.local || {})) if (!NO_COPIAR.includes(k)) localStorage.setItem(k, v);
    } catch { /* sin almacenamiento */ }
  }

  async function importar(archivo) {
    let d;
    try {
      d = await leer(archivo);
    } catch (e) {
      avisar('No se pudo leer: ' + (e.message || 'archivo raro'), null, 6000);
      return;
    }
    const t = d.tablas;
    $('respaldo-texto').textContent = `Respaldo del ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}/${d.fecha.slice(0, 4)}: `
      + `${(t.movimientos || []).length} movimientos, ${(t.negocios || []).length} negocios, `
      + `${(t.inventario || []).length} productos y ${(t.deudas || []).length} deudas. `
      + 'Lo que tienes ahora en este teléfono se cambia por eso.';
    const dlg = $('respaldo-confirmar');
    dlg.showModal();
    const ok = await new Promise(r => dlg.addEventListener('close', () => r(dlg.returnValue === 'si'), { once: true }));
    if (!ok) return;
    const antes = await datos();
    await aplicar(d);
    avisar('Respaldo cargado ✓', async () => { await aplicar(antes); location.reload(); }, 8000);
    setTimeout(() => location.reload(), 8200);
  }

  // ---------- Imagen con lo más importante ----------
  async function imagen() {
    const d = await datos();
    const mes = fechaLocal().slice(0, 7);
    const nomMes = MESES[Number(mes.slice(5, 7)) - 1];
    const espacios = [{ id: '', nombre: 'Personal' }, ...d.tablas.negocios.sort((a, b) => (a.orden || 0) - (b.orden || 0))];
    const bloques = espacios.map(e => {
      const movs = d.tablas.movimientos.filter(m => (m.negocio || '') === e.id && m.estado !== 'pendiente' && String(m.fecha).startsWith(mes));
      const suma = tipo => movs.filter(m => m.tipo === tipo).reduce((a, m) => a + (m.monto || 0), 0);
      const ing = suma('ingreso'), gas = suma('gasto'), inv = suma('inversion');
      const productos = d.tablas.inventario.filter(i => (i.negocio || '') === e.id);
      return { e, ing, gas, inv, productos, n: movs.length };
    });
    const deudas = d.tablas.deudas.map(x => ({ ...x, falta: (x.monto || 0) - (x.abonos || []).reduce((a, b) => a + (b.monto || 0), 0) })).filter(x => x.falta > 0);
    const meDeben = deudas.filter(x => x.sentido === 'medeben').reduce((a, x) => a + x.falta, 0);
    const debo = deudas.filter(x => x.sentido !== 'medeben').reduce((a, x) => a + x.falta, 0);

    const W = 1080, M = 60, oscuro = '#1d2a22', crema = '#fbf6ec', naranja = '#e8962e', verde = '#2f8f5b', rojo = '#c0533a', suave = '#7a7466';
    // Alto: cabecera + bloques + deudas.
    let alto = 230 + bloques.reduce((a, b) => a + 250 + (b.productos.length ? 60 + b.productos.length * 52 : 0), 0) + (deudas.length ? 190 : 0) + 80;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = alto;
    const c = cv.getContext('2d');
    const fuente = (px, peso = 400) => { c.font = `${peso} ${px}px system-ui, -apple-system, Roboto, sans-serif`; };
    c.fillStyle = crema;
    c.fillRect(0, 0, W, alto);
    c.fillStyle = oscuro;
    c.fillRect(0, 0, W, 190);
    c.fillStyle = naranja;
    fuente(64, 800);
    c.fillText('MIG', M, 105);
    c.fillStyle = '#fff';
    fuente(34, 600);
    c.fillText(`Resumen de ${nomMes} ${mes.slice(0, 4)}`, M + 160, 92);
    fuente(26);
    c.fillStyle = '#cfd8cf';
    const hoy = fechaLocal();
    c.fillText(`Al ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)} ${hoy.slice(11, 16)}`, M + 160, 135);
    let y = 230;
    const tarjeta = (x, yy, w, h) => {
      c.fillStyle = '#fff';
      c.beginPath();
      c.roundRect(x, yy, w, h, 22);
      c.fill();
      c.strokeStyle = '#e6dccb';
      c.lineWidth = 2;
      c.stroke();
    };
    for (const b of bloques) {
      const negocio = b.e.id !== '';
      const h = 220 + (b.productos.length ? 60 + b.productos.length * 52 : 0);
      tarjeta(M, y, W - 2 * M, h);
      c.fillStyle = oscuro;
      fuente(38, 700);
      c.fillText(b.e.nombre, M + 34, y + 58);
      const libre = b.ing - b.gas - (negocio ? 0 : b.inv);
      const cols = [
        [negocio ? 'Ventas' : 'Ingresos', b.ing, verde],
        ['Gastos', b.gas, rojo],
        [negocio ? 'Compras' : 'Inversión', b.inv, suave],
        [negocio ? 'Ganancia' : 'Libre', libre, libre < 0 ? rojo : verde],
      ];
      const cw = (W - 2 * M - 68) / 4;
      cols.forEach(([t, v, color], k) => {
        const x = M + 34 + k * cw;
        fuente(24);
        c.fillStyle = suave;
        c.fillText(t, x, y + 112);
        fuente(k === 3 ? 38 : 34, 700);
        c.fillStyle = color;
        c.fillText(dinero(v), x, y + 160, cw - 12);
      });
      fuente(22);
      c.fillStyle = suave;
      c.fillText(`${b.n} movimiento${b.n === 1 ? '' : 's'} este mes`, M + 34, y + 200);
      let yy = y + 220;
      if (b.productos.length) {
        c.fillStyle = '#efe7d8';
        c.fillRect(M + 34, yy, W - 2 * M - 68, 2);
        fuente(28, 700);
        c.fillStyle = oscuro;
        c.fillText('📦 Inventario', M + 34, yy + 44);
        yy += 60;
        for (const i of b.productos) {
          const bajo = i.stockActual <= i.stockMinimo;
          fuente(28);
          c.fillStyle = oscuro;
          c.fillText(i.nombre, M + 34, yy + 34, 520);
          fuente(28, 700);
          c.fillStyle = bajo ? rojo : verde;
          c.textAlign = 'right';
          c.fillText((bajo ? '⚠️ ' : '') + Inventario.cuanto(i, i.stockActual), W - M - 34, yy + 34);
          c.textAlign = 'left';
          yy += 52;
        }
      }
      y += h + 30;
    }
    if (deudas.length) {
      tarjeta(M, y, W - 2 * M, 160);
      fuente(34, 700);
      c.fillStyle = oscuro;
      c.fillText('🤝 Deudas', M + 34, y + 54);
      fuente(26);
      c.fillStyle = suave;
      c.fillText('Te deben', M + 34, y + 100);
      c.fillText('Debes', M + 34 + (W - 2 * M) / 2, y + 100);
      fuente(36, 700);
      c.fillStyle = verde;
      c.fillText(dinero(meDeben), M + 34, y + 142);
      c.fillStyle = rojo;
      c.fillText(dinero(debo), M + 34 + (W - 2 * M) / 2, y + 142);
      y += 190;
    }
    fuente(22);
    c.fillStyle = suave;
    c.textAlign = 'center';
    c.fillText('Hormiga$to$ · Controla tus finanzas', W / 2, y + 30);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    guardarArchivo(blob, `MIG-resumen-${hoy.slice(0, 10)}.png`);
    return cv;
  }

  return { hojas, importar, imagen, guardarArchivo, datos };
})();
