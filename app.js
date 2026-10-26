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
const COLORES = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

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
  const movs = (await DB.entre(...rangoMes(estado.mes))).sort((a, b) => b.fecha.localeCompare(a.fecha));

  let dia = '', html = '';
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
  $('lista').movs = movs;
  $('vacio').hidden = movs.length > 0;

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
  const movs = await DB.entre(...rangoMes(estado.mes));
  const g = agrupar(movs);
  const suma = (cats, campo) => cats.reduce((s, c) => s + c[campo], 0);
  const ing = { real: suma(g.ingreso, 'real'), ppto: suma(g.ingreso, 'ppto') };
  const egr = { real: suma(g.gasto, 'real'), ppto: suma(g.gasto, 'ppto') };
  const inv = { real: suma(g.inversion, 'real'), ppto: suma(g.inversion, 'ppto') };
  const libre = ing.real - egr.real - inv.real;
  const pctInvertido = ing.real ? Math.round(inv.real / ing.real * 100) : 0;

  // Distribución de egresos por categoría (la dona del Excel), como una barra.
  const conGasto = g.gasto.filter(c => c.real > 0);
  const distribucion = egr.real ? `
    <h2 class="seccion">Distribución de gastos</h2>
    <div class="dist">${conGasto.map((c, i) =>
      `<div style="width:${(c.real / egr.real * 100).toFixed(1)}%;background:${COLORES[i % COLORES.length]}"></div>`).join('')}</div>
    <ul class="leyenda">${conGasto.map((c, i) =>
      `<li><i style="background:${COLORES[i % COLORES.length]}"></i>${escapar(c.nombre)} <strong>${Math.round(c.real / egr.real * 100)}%</strong></li>`).join('')}</ul>` : '';

  $('resumen').innerHTML = `
    <div class="totales">
      <div><span>Ingresos</span><strong class="ingreso">${dinero(ing.real)}</strong><small>Ppto ${dinero(ing.ppto)}</small></div>
      <div><span>Gastos</span><strong class="gasto">${dinero(egr.real)}</strong><small>Ppto ${dinero(egr.ppto)}</small></div>
      <div><span>Inversión</span><strong class="inversion">${dinero(inv.real)}</strong><small>Ppto ${dinero(inv.ppto)}</small></div>
      <div><span>Libre</span><strong class="${libre < 0 ? 'gasto' : ''}">${dinero(libre)}</strong><small>Ppto ${dinero(ing.ppto - egr.ppto - inv.ppto)}</small></div>
    </div>
    <p class="nota centro">Ingresos − Gastos − Inversión = Libre. Inviertes el ${pctInvertido}% de lo que ganas.</p>
    <p class="nota centro">Gastos: ${diferencia(egr.real, egr.ppto, 'gasto')}. Inversión: ${diferencia(inv.real, inv.ppto, 'inversion')}. Ingresos: ${diferencia(ing.real, ing.ppto, 'ingreso')}.</p>
    ${bloqueTipo('Gastos por categoría', g.gasto, 'gasto')}
    ${distribucion}
    ${bloqueTipo('Inversión por categoría', g.inversion, 'inversion')}
    ${bloqueTipo('Ingresos por categoría', g.ingreso, 'ingreso')}`;
}

// ---------- Ajustes ----------

function pintarAjustes() {
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
  const movs = (await DB.todos()).sort((a, b) => a.fecha.localeCompare(b.fecha));
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finanzas-${fechaLocal().slice(0, 10)}.xlsx`;
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
  return true;
}

// ---------- Navegación ----------

function repintar() {
  if (estado.vista === 'anotar') pintarTipo();
  if (estado.vista === 'movimientos') pintarMovimientos();
  if (estado.vista === 'resumen') pintarResumen();
  if (estado.vista === 'ajustes') pintarAjustes();
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
  avisar(`Borrado: ${concepto(mov.concepto).nombre} ${dinero(mov.monto)}`, () => DB.guardar(mov));
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
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
