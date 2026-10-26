// Anotar con teclado, resumen y presupuesto como el Excel de fer.
// Montos siempre en centavos de dólar.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const SEGUNDOS_DESHACER = 4;
// Nombre de cada tipo en pantalla y en el Excel.
const TIPOS = {
  gasto: { texto: 'gasto', excel: 'Egreso', grupo: 'Gasto' },
  ingreso: { texto: 'ingreso', excel: 'Ingreso', grupo: 'Ingreso' },
  inversion: { texto: 'inversión', excel: 'Inversión', grupo: 'Inversión' },
};

const $ = id => document.getElementById(id);
const estado = {
  tipo: 'gasto',
  entrada: '',        // lo tecleado, p. ej. "1.5"
  inicio: null,       // cuándo empezó a escribir, para medir los 3 segundos
  mes: new Date(),    // mes visible en Movimientos y Resumen
  conceptos: [],
  editando: null,
  editandoConcepto: null,
  vista: 'anotar',
};

// ---------- Utilidades ----------

function concepto(id) {
  return estado.conceptos.find(c => c.id === id)
    || { id, nombre: id, icono: '•', categoria: 'Otros', tipo: 'gasto', presupuesto: 0 };
}

// "1.50", "1,50" o "1.5$" → 150. Devuelve null si no es un monto válido.
function aCentavos(texto) {
  const limpio = String(texto).replace(/[$\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(limpio) && !/^\.\d{1,2}$/.test(limpio)) return null;
  const [entero, dec = ''] = limpio.split('.');
  return Number(entero || 0) * 100 + Number((dec + '00').slice(0, 2));
}

function dinero(centavos) {
  const abs = Math.abs(centavos);
  const entero = Math.floor(abs / 100).toLocaleString('en-US');
  return `${centavos < 0 ? '-' : ''}$${entero}.${String(abs % 100).padStart(2, '0')}`;
}

// Fecha local como texto ISO sin zona: "2026-10-25T19:50:12".
function fechaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function nuevoId() {
  return crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function vibrar(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function escapar(t) {
  return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function rangoMes(d) {
  const desde = new Date(d.getFullYear(), d.getMonth(), 1);
  const hasta = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return [fechaLocal(desde), fechaLocal(hasta)];
}

// Los pendientes (frases por revisar) no cuentan en totales ni gráficos hasta que se confirman.
const listos = movs => movs.filter(x => x.estado !== 'pendiente');

async function cargarConceptos() {
  estado.conceptos = (await DB.conceptos()).sort((a, b) => a.orden - b.orden);
}

// ---------- Anotar ----------

function pintarTipo() {
  document.querySelectorAll('.tipo-btn').forEach(b => {
    const activo = b.dataset.tipo === estado.tipo;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-checked', activo);
  });
  document.body.dataset.tipo = estado.tipo;
  // Los más usados primero, para que queden siempre a la vista.
  const lista = estado.conceptos
    .filter(c => c.tipo === estado.tipo && !c.oculto)
    .sort((a, b) => (b.usos - a.usos) || (a.orden - b.orden));
  $('conceptos').innerHTML = lista.map(c =>
    `<button type="button" class="cat" data-concepto="${escapar(c.id)}"><span>${escapar(c.icono)}</span>${escapar(c.nombre)}</button>`
  ).join('');
}

function pintarMonto() {
  $('monto').textContent = '$' + (estado.entrada || '0');
}

function teclear(k) {
  let e = estado.entrada;
  if (k === 'borrar') {
    e = e.slice(0, -1);
  } else if (k === '.') {
    if (e.includes('.')) return;
    e = (e || '0') + '.';
  } else {
    if (e.includes('.') && e.split('.')[1].length >= 2) return;
    if (!e.includes('.') && e.replace(/^0+/, '').length >= 7) return;
    e = e === '0' ? k : e + k;
  }
  if (!estado.inicio && e) estado.inicio = Date.now();
  if (!e) estado.inicio = null;
  estado.entrada = e;
  pintarMonto();
  $('ayuda').classList.remove('alerta');
}

async function anotar(conceptoId) {
  const centavos = aCentavos(estado.entrada);
  if (!centavos) {
    $('ayuda').textContent = 'Primero escribe el monto';
    $('ayuda').classList.add('alerta');
    vibrar([40, 40, 40]);
    return;
  }
  const c = concepto(conceptoId);
  const mov = {
    id: nuevoId(),
    tipo: c.tipo,
    monto: centavos,
    moneda: 'USD',
    concepto: c.id,
    fecha: fechaLocal(),
    nota: '',
    frase: '',
    estado: 'listo',
    ms: estado.inicio ? Date.now() - estado.inicio : null,
    creado: new Date().toISOString(),
  };
  mov.editado = mov.creado;
  await DB.guardar(mov);
  c.usos = (c.usos || 0) + 1;
  await DB.guardarConcepto(c);
  vibrar(30);
  avisar(`Anotado: ${TIPOS[mov.tipo].texto} ${dinero(mov.monto)}, ${c.nombre.toLowerCase()}`, async () => {
    await DB.borrar(mov.id);
    c.usos = Math.max(0, c.usos - 1);
    await DB.guardarConcepto(c);
  });

  estado.entrada = '';
  estado.inicio = null;
  estado.tipo = 'gasto'; // gasto por defecto en cada registro
  $('ayuda').textContent = 'Escribe el monto y luego toca el concepto';
  pintarMonto();
}

// ---------- Aviso con Deshacer ----------

let temporizador, accionDeshacer;

function avisar(texto, deshacer) {
  clearTimeout(temporizador);
  accionDeshacer = deshacer;
  $('aviso-texto').textContent = texto;
  $('deshacer').hidden = !deshacer;
  $('aviso').hidden = false;
  temporizador = setTimeout(() => { $('aviso').hidden = true; accionDeshacer = null; },
    SEGUNDOS_DESHACER * 1000);
}

async function deshacer() {
  const accion = accionDeshacer;
  accionDeshacer = null;
  $('aviso').hidden = true;
  if (accion) await accion();
  repintar();
}

// ---------- Movimientos ----------

function pintarMes() {
  const m = estado.mes;
  document.querySelectorAll('.mes-nombre').forEach(h =>
    h.textContent = `${MESES[m.getMonth()]} ${m.getFullYear()}`);
}

async function pintarMovimientos() {
  pintarMes();
  const movs = listos(await DB.entre(...rangoMes(estado.mes))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pendientes = (await DB.todos()).filter(x => x.estado === 'pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha));

  let dia = '', html = '';
  if (pendientes.length) {
    html += `<li class="dia revisar">Por revisar (${pendientes.length})</li>`;
    for (const x of pendientes) {
      const c = x.concepto ? concepto(x.concepto) : { icono: '❓' };
      html += `<li><button type="button" class="mov pendiente" data-id="${x.id}">
        <span class="mov-icono">${escapar(c.icono)}</span>
        <span class="mov-texto"><strong>«${escapar(x.frase || 'Sin frase')}»</strong><small>${escapar(Voz.motivo(x))}</small></span>
        <span class="mov-monto">${x.monto ? dinero(x.monto) : '$?'}<small>${x.fecha.slice(8, 10)}/${x.fecha.slice(5, 7)}</small></span>
      </button></li>`;
    }
  }
  for (const x of movs) {
    const d = x.fecha.slice(0, 10);
    if (d !== dia) {
      dia = d;
      const f = new Date(d + 'T12:00:00');
      html += `<li class="dia">${DIAS[f.getDay()]} ${f.getDate()}</li>`;
    }
    const c = concepto(x.concepto);
    const signo = x.tipo === 'ingreso' ? 1 : -1;
    html += `<li><button type="button" class="mov ${x.tipo}" data-id="${x.id}">
      <span class="mov-icono">${escapar(c.icono)}</span>
      <span class="mov-texto"><strong>${escapar(c.nombre)}</strong><small>${escapar(c.categoria)}${x.nota ? ' · ' + escapar(x.nota) : ''}</small></span>
      <span class="mov-monto">${dinero(signo * x.monto)}<small>${x.fecha.slice(11, 16)}</small></span>
    </button></li>`;
  }
  $('lista').innerHTML = html;
  $('lista').movs = [...pendientes, ...movs];
  $('vacio').hidden = movs.length + pendientes.length > 0;

  // Meta de la fase 1: anotar en 3 segundos o menos.
  const medidos = movs.filter(x => x.ms != null);
  if (medidos.length) {
    const prom = medidos.reduce((s, x) => s + x.ms, 0) / medidos.length / 1000;
    const rapidos = medidos.filter(x => x.ms <= 3000).length;
    $('rapidez').textContent = `Tardaste ${prom.toFixed(1)} s en promedio para anotar. `
      + `${rapidos} de ${medidos.length} en 3 s o menos.`;
  } else {
    $('rapidez').textContent = '';
  }
}

// ---------- Resumen (el Dashboard del Excel) ----------

// Agrupa el mes por tipo → categoría → concepto, con presupuesto y real.
function agrupar(movs) {
  const real = {};
  for (const x of movs) real[x.concepto] = (real[x.concepto] || 0) + x.monto;
  const ids = new Set([...estado.conceptos.filter(c => c.presupuesto > 0).map(c => c.id), ...Object.keys(real)]);
  const tipos = { ingreso: new Map(), gasto: new Map(), inversion: new Map() };
  for (const id of ids) {
    const c = concepto(id);
    const fila = { c, ppto: c.presupuesto || 0, real: real[id] || 0 };
    const cats = tipos[c.tipo] || tipos.gasto;
    if (!cats.has(c.categoria)) cats.set(c.categoria, { nombre: c.categoria, ppto: 0, real: 0, conceptos: [] });
    const cat = cats.get(c.categoria);
    cat.ppto += fila.ppto;
    cat.real += fila.real;
    cat.conceptos.push(fila);
  }
  const ordenar = cats => [...cats.values()]
    .map(cat => ({ ...cat, conceptos: cat.conceptos.sort((a, b) => b.real - a.real || b.ppto - a.ppto) }))
    .sort((a, b) => b.real - a.real || b.ppto - a.ppto);
  return { ingreso: ordenar(tipos.ingreso), gasto: ordenar(tipos.gasto), inversion: ordenar(tipos.inversion) };
}

function barra(real, ppto, tipo) {
  if (!ppto) return '';
  const pct = Math.min(real / ppto, 1) * 100;
  const pasado = tipo === 'gasto' && real > ppto;
  return `<div class="barra"><div class="barra-relleno ${tipo}${pasado ? ' pasado' : ''}" style="width:${pct.toFixed(1)}%"></div></div>`;
}

// Diferencia contra el presupuesto, dicha en palabras.
function diferencia(real, ppto, tipo) {
  if (!ppto) return 'sin presupuesto';
  const dif = real - ppto;
  if (dif === 0) return 'justo lo presupuestado';
  if (tipo === 'gasto') return dif > 0 ? `te pasaste ${dinero(dif)}` : `quedan ${dinero(-dif)}`;
  // Ingresos e inversión: llegar a la meta es lo bueno.
  return dif >= 0 ? `superaste por ${dinero(dif)}` : `faltan ${dinero(-dif)}`;
}

function bloqueTipo(titulo, cats, tipo) {
  if (!cats.length) return '';
  return `<h2 class="seccion">${titulo}</h2>` + cats.map(cat => `
    <details class="categoria">
      <summary>
        <div class="fila"><strong>${escapar(cat.nombre)}</strong><span>${dinero(cat.real)}<small> de ${dinero(cat.ppto)}</small></span></div>
        ${barra(cat.real, cat.ppto, tipo)}
      </summary>
      ${cat.conceptos.map(f => `
        <div class="concepto-fila">
          <div class="fila"><span>${escapar(f.c.icono)} ${escapar(f.c.nombre)}</span><span>${dinero(f.real)}<small> de ${dinero(f.ppto)}</small></span></div>
          ${barra(f.real, f.ppto, tipo)}
        </div>`).join('')}
    </details>`).join('');
}

async function pintarResumen() {
  pintarMes();
  const m = estado.mes;
  const movs = listos(await DB.entre(...rangoMes(m)));
  const g = agrupar(movs);
  const suma = (cats, campo) => cats.reduce((s, c) => s + c[campo], 0);
  const ing = { real: suma(g.ingreso, 'real'), ppto: suma(g.ingreso, 'ppto') };
  const egr = { real: suma(g.gasto, 'real'), ppto: suma(g.gasto, 'ppto') };
  const inv = { real: suma(g.inversion, 'real'), ppto: suma(g.inversion, 'ppto') };
  const libre = ing.real - egr.real - inv.real;
  const pctInvertido = ing.real ? Math.round(inv.real / ing.real * 100) : 0;

  // 1. ¿A dónde se fue el ingreso? Gastos, inversión y lo que queda libre.
  const reparto = Graficos.dona([
    { nombre: 'Gastos', valor: egr.real, color: 'var(--c-gasto)' },
    { nombre: 'Inversión', valor: inv.real, color: 'var(--c-inversion)' },
    { nombre: 'Libre', valor: Math.max(libre, 0), color: 'var(--c-libre)' },
  ].filter(p => p.valor > 0), { titulo: libre < 0 ? 'Te faltan' : 'Libre', valor: dinero(Math.abs(libre)) });

  // 2. Curva de gastos acumulados día a día contra el ritmo del presupuesto.
  const totalDias = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const hoy = new Date();
  const esEsteMes = hoy.getFullYear() === m.getFullYear() && hoy.getMonth() === m.getMonth();
  const hasta = esEsteMes ? hoy.getDate() : totalDias;
  const porDia = Array(totalDias + 1).fill(0);
  for (const x of movs) if (x.tipo === 'gasto') porDia[Number(x.fecha.slice(8, 10))] += x.monto;
  const dias = [];
  for (let d = 1, acc = 0; d <= hasta; d++) { acc += porDia[d]; dias.push({ dia: d, acumulado: acc }); }
  const curva = egr.real || egr.ppto ? Graficos.curva(dias, egr.ppto, totalDias, 'var(--c-gasto)') : '';
  const ritmo = egr.ppto ? Math.round(egr.ppto * hasta / totalDias) : 0;
  const frase = !egr.ppto ? '' : egr.real > ritmo
    ? `Vas ${dinero(egr.real - ritmo)} por encima del ritmo del presupuesto.`
    : `Vas ${dinero(ritmo - egr.real)} por debajo del ritmo del presupuesto.`;

  // 3. Gastos por concepto: los 5 mayores y el resto junto en "Otros".
  const conceptosGasto = g.gasto.flatMap(c => c.conceptos).filter(f => f.real > 0).sort((a, b) => b.real - a.real);
  const top = conceptosGasto.slice(0, 5).map((f, i) => ({ nombre: f.c.nombre, valor: f.real, color: `var(--c${i + 1})` }));
  const resto = conceptosGasto.slice(5).reduce((s, f) => s + f.real, 0);
  if (resto) top.push({ nombre: 'Otros', valor: resto, color: 'var(--c-otros)' });
  const donaGastos = Graficos.dona(top, { titulo: 'Gastos', valor: dinero(egr.real) });

  // 4. Últimos 6 meses: ingresos, gastos e inversión.
  const inicio = new Date(m.getFullYear(), m.getMonth() - 5, 1);
  const seis = listos(await DB.entre(fechaLocal(inicio), rangoMes(m)[1]));
  const meses = Array.from({ length: 6 }, (_, k) => {
    const f = new Date(inicio.getFullYear(), inicio.getMonth() + k, 1);
    const clave = fechaLocal(f).slice(0, 7);
    const delMes = seis.filter(x => x.fecha.startsWith(clave));
    const t = tipo => delMes.filter(x => x.tipo === tipo).reduce((s, x) => s + x.monto, 0);
    return { nombre: MESES[f.getMonth()].slice(0, 3), valores: [t('ingreso'), t('gasto'), t('inversion')] };
  });
  const historial = meses.some(x => x.valores.some(v => v)) ? Graficos.barras(meses, [
    { nombre: 'Ingresos', color: 'var(--c-ingreso)' },
    { nombre: 'Gastos', color: 'var(--c-gasto)' },
    { nombre: 'Inversión', color: 'var(--c-inversion)' },
  ]) : '';

  const tarjeta = (titulo, cuerpo, pie = '') => cuerpo
    ? `<section class="tarjeta"><h2>${titulo}</h2>${cuerpo}${pie ? `<p class="nota">${pie}</p>` : ''}</section>` : '';

  $('resumen').innerHTML = `
    <div class="totales">
      <div><span>Ingresos</span><strong class="ingreso">${dinero(ing.real)}</strong><small>Ppto ${dinero(ing.ppto)}</small></div>
      <div><span>Gastos</span><strong class="gasto">${dinero(egr.real)}</strong><small>Ppto ${dinero(egr.ppto)}</small></div>
      <div><span>Inversión</span><strong class="inversion">${dinero(inv.real)}</strong><small>Ppto ${dinero(inv.ppto)}</small></div>
      <div><span>Libre</span><strong class="${libre < 0 ? 'gasto' : ''}">${dinero(libre)}</strong><small>Ppto ${dinero(ing.ppto - egr.ppto - inv.ppto)}</small></div>
    </div>
    ${tarjeta('¿A dónde se fue tu ingreso?', reparto, `Inviertes el ${pctInvertido}% de lo que ganas. Toca la dona para ver cada parte.`)}
    ${tarjeta('Gastos del mes, día a día', curva, `${frase} La línea punteada es el presupuesto repartido parejo en el mes.`)}
    ${tarjeta('¿En qué gastas más?', donaGastos)}
    ${tarjeta('Últimos 6 meses', historial, 'Toca un mes para ver los montos.')}
    <p class="nota centro">Gastos: ${diferencia(egr.real, egr.ppto, 'gasto')}. Inversión: ${diferencia(inv.real, inv.ppto, 'inversion')}. Ingresos: ${diferencia(ing.real, ing.ppto, 'ingreso')}.</p>
    ${bloqueTipo('Gastos por categoría', g.gasto, 'gasto')}
    ${bloqueTipo('Inversión por categoría', g.inversion, 'inversion')}
    ${bloqueTipo('Ingresos por categoría', g.ingreso, 'ingreso')}`;
  Graficos.activar($('resumen'));
}

// ---------- Proyección ----------

// Presupuesto del mes (lo que esperas) y cierre estimado al ritmo de gasto actual.
async function pintarProyeccion() {
  const hoy = new Date();
  const totalDias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const ppto = tipo => estado.conceptos.filter(c => c.tipo === tipo).reduce((s, c) => s + (c.presupuesto || 0), 0);
  const p = { ingreso: ppto('ingreso'), gasto: ppto('gasto'), inversion: ppto('inversion') };
  const libreP = p.ingreso - p.gasto - p.inversion;

  const movs = listos(await DB.entre(...rangoMes(hoy)));
  const real = tipo => movs.filter(x => x.tipo === tipo).reduce((s, x) => s + x.monto, 0);
  const r = { ingreso: real('ingreso'), gasto: real('gasto'), inversion: real('inversion') };
  const gastoCierre = Math.round(r.gasto / hoy.getDate() * totalDias);
  const ingresoCierre = Math.max(r.ingreso, p.ingreso);
  const inversionCierre = Math.max(r.inversion, p.inversion);
  const libreCierre = ingresoCierre - gastoCierre - inversionCierre;

  const reparto = Graficos.dona([
    { nombre: 'Gastos', valor: p.gasto, color: 'var(--c-gasto)' },
    { nombre: 'Inversión', valor: p.inversion, color: 'var(--c-inversion)' },
    { nombre: 'Libre', valor: Math.max(libreP, 0), color: 'var(--c-libre)' },
  ].filter(x => x.valor > 0), { titulo: libreP < 0 ? 'Faltarían' : 'Libre', valor: dinero(Math.abs(libreP)) });

  const fila = (nombre, valor, clase = '') =>
    `<div class="fila linea"><span>${nombre}</span><strong class="${clase}">${valor}</strong></div>`;
  $('proyeccion').innerHTML = `
    <h1 class="titulo">Proyección de ${MESES[hoy.getMonth()]}</h1>
    <section class="tarjeta">
      <h2>Lo que esperas en el mes</h2>
      ${reparto}
      <p class="nota">Ingresos esperados ${dinero(p.ingreso)}. Sale de los presupuestos de abajo: cámbialos y la proyección se actualiza.</p>
    </section>
    <section class="tarjeta">
      <h2>Si sigues a este ritmo</h2>
      ${fila(`Gastos al cierre (llevas ${dinero(r.gasto)} en ${hoy.getDate()} días)`, dinero(gastoCierre), gastoCierre > p.gasto ? 'critico' : 'gasto')}
      ${fila('Gastos presupuestados', dinero(p.gasto))}
      ${fila('Ingresos del mes', dinero(ingresoCierre), 'ingreso')}
      ${fila('Inversión del mes', dinero(inversionCierre), 'inversion')}
      ${fila('Libre al cierre', dinero(libreCierre), libreCierre < 0 ? 'critico' : '')}
      <p class="nota">${p.gasto && gastoCierre > p.gasto
        ? `A este ritmo te pasarías ${dinero(gastoCierre - p.gasto)} del presupuesto de gastos. Para no pasarte, puedes gastar ${dinero(Math.round(Math.max(p.gasto - r.gasto, 0) / Math.max(totalDias - hoy.getDate(), 1)))} por día lo que queda del mes.`
        : p.gasto ? `En gastos vas bien: puedes gastar hasta ${dinero(Math.round((p.gasto - r.gasto) / Math.max(totalDias - hoy.getDate(), 1)))} por día lo que queda del mes.`
        : 'Pon presupuesto a tus conceptos de gasto para ver cuánto puedes gastar por día.'}
        Ingresos e inversión cuentan lo presupuestado o lo ya anotado, lo que sea mayor.</p>
      ${libreP < 0 ? `<p class="nota critico">Tus presupuestos de gastos e inversión suman ${dinero(-libreP)} más que tus ingresos esperados. Baja alguno abajo para que el mes cuadre.</p>` : ''}
    </section>`;
  Graficos.activar($('proyeccion'));
}

function pintarAjustes() {
  pintarProyeccion();
  Voz.pintarAjustes();
  const grupos = new Map();
  for (const c of estado.conceptos) {
    const clave = `${TIPOS[c.tipo].grupo} · ${c.categoria}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(c);
  }
  const claves = [...grupos.keys()].sort((a, b) => a.localeCompare(b));
  $('ajustes-lista').innerHTML = claves.map(k => `
    <h2 class="seccion">${escapar(k)}</h2>
    <ul class="lista">${grupos.get(k).map(c => `
      <li><button type="button" class="mov" data-concepto="${escapar(c.id)}">
        <span class="mov-icono">${escapar(c.icono)}</span>
        <span class="mov-texto"><strong>${escapar(c.nombre)}</strong>${c.oculto ? '<small>Oculto en Anotar</small>' : ''}</span>
        <span class="mov-monto">${dinero(c.presupuesto)}<small>al mes</small></span>
      </button></li>`).join('')}</ul>`).join('');
}

function abrirConcepto(c) {
  estado.editandoConcepto = c;
  const f = $('concepto-form');
  const categorias = [...new Set(estado.conceptos.map(x => x.categoria))].sort();
  $('lista-categorias').innerHTML = categorias.map(x => `<option value="${escapar(x)}">`).join('');
  f.nombre.value = c ? c.nombre : '';
  f.icono.value = c ? c.icono : '';
  f.tipo.value = c ? c.tipo : 'gasto';
  f.categoria.value = c ? c.categoria : '';
  f.presupuesto.value = c ? (c.presupuesto / 100).toFixed(2) : '';
  f.oculto.checked = c ? !!c.oculto : false;
  $('editor-concepto').showModal();
}

async function guardarConcepto() {
  const f = $('concepto-form');
  const ppto = f.presupuesto.value.trim() === '' ? 0 : aCentavos(f.presupuesto.value);
  if (ppto === null) {
    f.presupuesto.setCustomValidity('Escribe un monto, por ejemplo 100 o 20.50');
    f.presupuesto.reportValidity();
    return false;
  }
  const previo = estado.editandoConcepto;
  const c = {
    ...(previo || { id: nuevoId(), orden: estado.conceptos.length, usos: 0 }),
    nombre: f.nombre.value.trim(),
    icono: f.icono.value.trim() || '•',
    tipo: f.tipo.value,
    categoria: f.categoria.value.trim(),
    presupuesto: ppto,
    oculto: f.oculto.checked,
  };
  await DB.guardarConcepto(c);
  await cargarConceptos();
  return true;
}

// ---------- Exportar a Excel ----------

async function exportar() {
  const movs = listos(await DB.todos()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const filas = [];
  const meses = new Set();
  for (const x of movs) {
    const c = concepto(x.concepto);
    meses.add(x.fecha.slice(0, 7));
    filas.push([x.fecha.slice(0, 10), c.tipo, c.categoria, c.nombre, 0, x.monto, x.nota || '']);
  }
  // Como en el Excel: una fila de presupuesto por concepto el día 1 de cada mes, con monto 0.
  for (const m of meses) {
    for (const c of estado.conceptos.filter(c => c.presupuesto > 0)) {
      filas.push([m + '-01', c.tipo, c.categoria, c.nombre, c.presupuesto, 0, '']);
    }
  }
  filas.sort((a, b) => a[0].localeCompare(b[0]));
  const datos = filas.map(([fecha, tipo, cat, con, ppto, monto, nota]) => [
    { fecha }, MESES[Number(fecha.slice(5, 7)) - 1].replace(/^./, l => l.toUpperCase()), TIPOS[tipo].excel,
    cat, con, ppto / 100, monto / 100, nota,
  ]);
  const encabezado = ['Fecha', 'Mes', 'Tipo', 'Categoria', 'Concepto', 'Presupuesto', 'Monto', 'Nota'];
  const blob = Excel.libro('Movimientos', [encabezado, ...datos]);
  const nombre = `finanzas-${fechaLocal().slice(0, 10)}.xlsx`;
  // En la app Android no hay descargas del navegador: el archivo se guarda en Descargas desde Java.
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

// ---------- Editor de movimientos ----------

function opcionesConcepto(tipo, elegido) {
  const sel = $('editor-form').concepto;
  const cats = new Map();
  for (const c of estado.conceptos.filter(c => c.tipo === tipo)) {
    if (!cats.has(c.categoria)) cats.set(c.categoria, []);
    cats.get(c.categoria).push(c);
  }
  sel.innerHTML = [...cats].map(([cat, cs]) => `<optgroup label="${escapar(cat)}">${cs.map(c =>
    `<option value="${escapar(c.id)}">${escapar(c.icono)} ${escapar(c.nombre)}</option>`).join('')}</optgroup>`).join('');
  if (estado.conceptos.some(c => c.id === elegido && c.tipo === tipo)) sel.value = elegido;
}

function abrirEditor(mov) {
  estado.editando = mov;
  const f = $('editor-form');
  f.tipo.value = mov.tipo;
  opcionesConcepto(mov.tipo, mov.concepto);
  f.monto.value = (mov.monto / 100).toFixed(2);
  f.fecha.value = mov.fecha.slice(0, 16);
  f.nota.value = mov.nota || '';
  $('editor-frase').textContent = mov.frase ? `Dijiste: «${mov.frase}»` : '';
  $('editor-frase').hidden = !mov.frase;
  $('editor-titulo').textContent = mov.estado === 'pendiente' ? 'Revisar y confirmar' : 'Editar movimiento';
  $('editor').showModal();
}

async function guardarEdicion() {
  const f = $('editor-form');
  const centavos = aCentavos(f.monto.value);
  if (!centavos) {
    f.monto.setCustomValidity('Escribe un monto, por ejemplo 1.50');
    f.monto.reportValidity();
    return false;
  }
  const mov = {
    ...estado.editando,
    tipo: f.tipo.value,
    monto: centavos,
    concepto: f.concepto.value,
    fecha: f.fecha.value + ':00',
    nota: f.nota.value.trim(),
    estado: 'listo',
    editado: new Date().toISOString(),
  };
  await DB.guardar(mov);
  if (estado.editando.estado === 'pendiente') {
    const c = estado.conceptos.find(x => x.id === mov.concepto);
    if (c) { c.usos = (c.usos || 0) + 1; await DB.guardarConcepto(c); }
  }
  return true;
}

// Cuántas frases esperan revisión: se ve como un número sobre Movimientos.
async function pintarPendientes() {
  const n = (await DB.todos()).filter(x => x.estado === 'pendiente').length;
  const b = document.querySelector('.nav-btn[data-vista="movimientos"]');
  if (n) b.dataset.cuenta = n; else delete b.dataset.cuenta;
}

// ---------- Navegación ----------

function repintar() {
  if (estado.vista === 'anotar') pintarTipo();
  if (estado.vista === 'movimientos') pintarMovimientos();
  if (estado.vista === 'resumen') pintarResumen();
  if (estado.vista === 'ajustes') pintarAjustes();
  pintarPendientes();
}

function mostrar(vista) {
  estado.vista = vista;
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + vista));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  repintar();
}

// ---------- Eventos ----------

$('teclado').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) teclear(b.dataset.k);
});

$('conceptos').addEventListener('click', async e => {
  const b = e.target.closest('.cat');
  if (!b) return;
  await anotar(b.dataset.concepto);
  pintarTipo();
});

document.querySelector('.tipo').addEventListener('click', e => {
  const b = e.target.closest('.tipo-btn');
  if (!b) return;
  estado.tipo = b.dataset.tipo;
  pintarTipo();
});

document.querySelector('.nav').addEventListener('click', e => {
  const b = e.target.closest('.nav-btn');
  if (b) mostrar(b.dataset.vista);
});

$('deshacer').addEventListener('click', deshacer);

document.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => {
  estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + Number(b.dataset.mes), 1);
  repintar();
}));

$('lista').addEventListener('click', e => {
  const b = e.target.closest('.mov');
  if (!b) return;
  const mov = $('lista').movs.find(x => x.id === b.dataset.id);
  if (mov) abrirEditor(mov);
});

$('editor-form').tipo.addEventListener('change', e => opcionesConcepto(e.target.value));
$('editor-form').monto.addEventListener('input', e => e.target.setCustomValidity(''));

$('editor-form').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'guardar') {
    e.preventDefault();
    if (await guardarEdicion()) {
      $('editor').close();
      repintar();
    }
  }
});

$('editor-borrar').addEventListener('click', async () => {
  const mov = estado.editando;
  $('editor').close();
  await DB.borrar(mov.id);
  repintar();
  avisar(`Borrado: ${mov.concepto ? concepto(mov.concepto).nombre : '«' + mov.frase + '»'} ${dinero(mov.monto)}`, () => DB.guardar(mov));
});

$('ajustes-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-concepto]');
  if (b) abrirConcepto(concepto(b.dataset.concepto));
});
$('nuevo-concepto').addEventListener('click', () => abrirConcepto(null));
$('concepto-form').presupuesto.addEventListener('input', e => e.target.setCustomValidity(''));
$('concepto-form').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'guardar') {
    e.preventDefault();
    if (await guardarConcepto()) {
      $('editor-concepto').close();
      repintar();
    }
  }
});

$('exportar').addEventListener('click', exportar);

// Teclado físico (para probar en computadora).
document.addEventListener('keydown', e => {
  if (estado.vista !== 'anotar' || document.querySelector('dialog[open]')) return;
  if (/^\d$/.test(e.key)) teclear(e.key);
  else if (e.key === '.' || e.key === ',') teclear('.');
  else if (e.key === 'Backspace') teclear('borrar');
});

(async () => {
  await cargarConceptos();
  pintarTipo();
  pintarMonto();
  pintarPendientes();
  // Acceso directo "Anotar por voz" del ícono: abre directo el micrófono.
  if (new URLSearchParams(location.search).has('voz')) {
    history.replaceState(null, '', location.pathname);
    Voz.escuchar();
  }
  Voz.procesarPendientes();
})();

if ('serviceWorker' in navigator) {
  // Cuando llega una versión nueva, se recarga una vez para usarla de inmediato
  // (si no, la nueva solo se ve al abrir la app por segunda vez).
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaVersion && !recargando) { recargando = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
