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
  // Solo del espacio que estás viendo (Personal o un negocio). En un negocio, el inventario en detalle.
  const FRAC = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' };
  // Cantidad en enteros: 136 usuarios de a 3 = "45⅓".
  function enteros(item, n) {
    const p = Inventario.porPartes(item);
    if (p === 1) return String(n);
    const e = Math.floor(n / p), r = n % p;
    if (!r) return String(e);
    const g = (a, b) => (b ? g(b, a % b) : a), k = g(r, p);
    const f = FRAC[`${r / k}/${p / k}`];
    return f ? `${e || ''}${f}` : (n / p).toFixed(1);
  }

  async function imagen(espacio = '') {
    const d = await datos();
    const mes = fechaLocal().slice(0, 7);
    const nomMes = MESES[Number(mes.slice(5, 7)) - 1];
    const neg = d.tablas.negocios.find(n => n.id === espacio);
    const negocio = !!neg;
    const nombre = neg ? neg.nombre : 'Personal';
    const conceptos = Object.fromEntries(d.tablas.conceptos.map(c => [c.id, c]));
    const movs = d.tablas.movimientos.filter(m => (m.negocio || '') === espacio && m.estado !== 'pendiente' && String(m.fecha).startsWith(mes));
    const suma = tipo => movs.filter(m => m.tipo === tipo).reduce((a, m) => a + (m.monto || 0), 0);
    const ing = suma('ingreso'), gas = suma('gasto'), inv = suma('inversion');
    const libre = ing - gas - (negocio ? 0 : inv);
    const productos = d.tablas.inventario.filter(i => (i.negocio || '') === espacio);
    const porConcepto = {};
    for (const m of movs) {
      if (m.tipo === 'traspaso') continue;
      const c = conceptos[m.concepto] || { nombre: 'Sin concepto', icono: '•', tipo: m.tipo };
      const k = m.concepto || '?';
      porConcepto[k] = porConcepto[k] || { c, tipo: m.tipo, total: 0, n: 0 };
      porConcepto[k].total += m.monto || 0;
      porConcepto[k].n++;
    }
    const top = Object.values(porConcepto).sort((a, b) => b.total - a.total).slice(0, 8);
    const deudas = d.tablas.deudas.filter(x => (x.negocio || '') === espacio)
      .map(x => ({ ...x, falta: (x.monto || 0) - (x.abonos || []).reduce((a, b) => a + (b.monto || 0), 0) })).filter(x => x.falta > 0);

    const W = 1080, M = 50, IN = M + 34, ANCHO = W - 2 * M;
    const oscuro = '#1d2a22', crema = '#fbf6ec', naranja = '#e8962e', verde = '#2f8f5b', rojo = '#c0533a', suave = '#7a7466', linea = '#efe7d8';
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 6000;
    const c = cv.getContext('2d');
    const fuente = (px, peso = 400) => { c.font = `${peso} ${px}px system-ui, -apple-system, Roboto, sans-serif`; };
    const texto = (t, x, yy, { px = 26, peso = 400, color = oscuro, alin = 'left', max } = {}) => {
      fuente(px, peso);
      c.fillStyle = color;
      c.textAlign = alin;
      c.fillText(t, x, yy, max);
      c.textAlign = 'left';
    };
    const tarjeta = (yy, h) => {
      c.fillStyle = '#fff';
      c.beginPath();
      c.roundRect(M, yy, ANCHO, h, 22);
      c.fill();
      c.strokeStyle = '#e6dccb';
      c.lineWidth = 2;
      c.stroke();
    };
    c.fillStyle = crema;
    c.fillRect(0, 0, W, cv.height);
    c.fillStyle = oscuro;
    c.fillRect(0, 0, W, 200);
    texto('MIG', M, 112, { px: 64, peso: 800, color: naranja });
    texto(`${neg && neg.icono ? neg.icono + ' ' : ''}${nombre}`, M + 160, 88, { px: 44, peso: 700, color: '#fff', max: W - M - 210 });
    const hoy = fechaLocal();
    texto(`Resumen de ${nomMes} ${mes.slice(0, 4)} · al ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)} ${hoy.slice(11, 16)}`, M + 160, 140, { px: 26, color: '#cfd8cf' });
    let y = 240;

    // Totales del mes.
    tarjeta(y, 190);
    const cols = [
      [negocio ? 'Ventas' : 'Ingresos', ing, verde],
      ['Gastos', gas, rojo],
      [negocio ? 'Compras' : 'Inversión', inv, suave],
      [negocio ? 'Ganancia' : 'Libre', libre, libre < 0 ? rojo : verde],
    ];
    const cw = (ANCHO - 68) / 4;
    cols.forEach(([t, v, color], k) => {
      texto(t, IN + k * cw, y + 58, { px: 24, color: suave });
      texto(dinero(v), IN + k * cw, y + 108, { px: k === 3 ? 38 : 34, peso: 700, color, max: cw - 12 });
    });
    texto(`${movs.length} movimiento${movs.length === 1 ? '' : 's'} este mes`, IN, y + 158, { px: 22, color: suave });
    y += 220;

    // Inventario en detalle (solo negocios con productos).
    if (productos.length) {
      const fila = 66;
      const h = 150 + productos.length * fila + 70;
      tarjeta(y, h);
      texto('📦 Inventario', IN, y + 56, { px: 34, peso: 700 });
      const X = [IN, 420, 545, 680, 815, W - M - 34];
      const cab = ['Producto', 'Al empezar', 'Entraron', 'Vendidos mes', 'Vendidos total', 'Quedan'];
      cab.forEach((t, k) => texto(t, X[k], y + 110, { px: 20, peso: 600, color: suave, alin: k ? (k === 5 ? 'right' : 'center') : 'left', max: k ? 125 : 300 }));
      let yy = y + 128;
      let totVendMes = 0;
      for (const it of productos) {
        c.fillStyle = linea;
        c.fillRect(IN, yy, ANCHO - 68, 2);
        const ventas = it.historial.filter(h2 => h2.tipo === 'venta');
        const entraron = it.historial.filter(h2 => h2.tipo === 'compra').reduce((a, h2) => a + h2.cantidad, 0);
        const vendMes = ventas.filter(h2 => String(h2.fecha).startsWith(mes)).reduce((a, h2) => a + h2.cantidad, 0);
        const vendTot = ventas.reduce((a, h2) => a + h2.cantidad, 0);
        totVendMes += vendMes / Inventario.porPartes(it);
        const bajo = it.stockActual <= it.stockMinimo;
        const p = Inventario.porPartes(it);
        texto(it.nombre, IN, yy + (p > 1 ? 36 : 44), { px: 26, peso: 600, max: 300 });
        if (p > 1) texto(`en ${Inventario.palabrasLista(it.unidad)[0] || 'enteros'}s · 1 = ${p} ${Inventario.palabrasLista(it.parte)[0] || 'partes'}s`, IN, yy + 60, { px: 18, color: suave, max: 300 });
        [it.stockInicial, entraron, vendMes, vendTot].forEach((v, k) =>
          texto((k === 1 && v ? '+' : '') + enteros(it, v), X[k + 1], yy + 44, { px: 26, alin: 'center', color: k >= 2 && v ? oscuro : suave, peso: k >= 2 ? 600 : 400 }));
        texto((bajo ? '⚠️ ' : '') + enteros(it, it.stockActual), X[5], yy + 44, { px: 30, peso: 800, color: bajo ? rojo : verde, alin: 'right' });
        yy += fila;
      }
      c.fillStyle = linea;
      c.fillRect(IN, yy, ANCHO - 68, 2);
      const bajos = productos.filter(it => it.stockActual <= it.stockMinimo);
      texto(`Vendidos este mes: ${Math.round(totVendMes * 10) / 10}` + (bajos.length ? `  ·  ⚠️ Stock bajo: ${bajos.map(b => b.nombre).join(', ')}` : '  ·  Todo con stock'),
        IN, yy + 46, { px: 22, color: bajos.length ? rojo : suave, max: ANCHO - 68 });
      y += h + 30;
    }

    // En qué se fue y de dónde vino la plata este mes.
    if (top.length) {
      const fila = 58;
      const h = 90 + top.length * fila + 10;
      tarjeta(y, h);
      texto('Por concepto este mes', IN, y + 56, { px: 30, peso: 700 });
      const max = Math.max(...top.map(t => t.total), 1);
      let yy = y + 90;
      for (const t of top) {
        const color = t.tipo === 'ingreso' ? verde : t.tipo === 'gasto' ? rojo : suave;
        texto(`${t.c.icono || ''} ${t.c.nombre}`, IN, yy + 30, { px: 24, max: 380 });
        c.fillStyle = color + '33';
        c.beginPath();
        c.roundRect(470, yy + 10, 330 * t.total / max + 6, 26, 8);
        c.fill();
        texto(dinero(t.total), W - M - 34, yy + 32, { px: 26, peso: 700, color, alin: 'right' });
        yy += fila;
      }
      y += h + 30;
    }

    if (deudas.length) {
      const meDeben = deudas.filter(x => x.sentido === 'medeben').reduce((a, x) => a + x.falta, 0);
      const debo = deudas.filter(x => x.sentido !== 'medeben').reduce((a, x) => a + x.falta, 0);
      const lista = deudas.slice(0, 6);
      const h = 170 + lista.length * 44;
      tarjeta(y, h);
      texto('🤝 Deudas', IN, y + 54, { px: 32, peso: 700 });
      texto('Te deben', IN, y + 98, { px: 24, color: suave });
      texto('Debes', IN + ANCHO / 2, y + 98, { px: 24, color: suave });
      texto(dinero(meDeben), IN, y + 140, { px: 34, peso: 700, color: verde });
      texto(dinero(debo), IN + ANCHO / 2, y + 140, { px: 34, peso: 700, color: rojo });
      let yy = y + 180;
      for (const x of lista) {
        texto(`${x.sentido === 'medeben' ? '↘︎ Te debe' : '↗︎ Le debes a'} ${x.persona}`, IN, yy, { px: 22, color: suave, max: 600 });
        texto(dinero(x.falta), W - M - 34, yy, { px: 22, peso: 600, alin: 'right', color: x.sentido === 'medeben' ? verde : rojo });
        yy += 44;
      }
      y += h + 30;
    }

    texto('Hormiga$to$ · Controla tus finanzas', W / 2, y + 30, { px: 22, color: suave, alin: 'center' });
    const fin = document.createElement('canvas');
    fin.width = W;
    fin.height = y + 70;
    fin.getContext('2d').drawImage(cv, 0, 0);
    const blob = await new Promise(r => fin.toBlob(r, 'image/png'));
    const archivo = nombre.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'resumen';
    guardarArchivo(blob, `MIG-${archivo}-${hoy.slice(0, 10)}.png`);
    return fin;
  }

  return { hojas, importar, imagen, guardarArchivo, datos };
})();
