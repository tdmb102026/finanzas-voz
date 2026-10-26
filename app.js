// Fase 1: anotar con teclado, sin IA. Montos siempre en centavos de dólar.
const CATEGORIAS = {
  gasto: [
    { id: 'comida', nombre: 'Comida', icono: '🍽️' },
    { id: 'transporte', nombre: 'Transporte', icono: '🚌' },
    { id: 'casa', nombre: 'Casa', icono: '🏠' },
    { id: 'salud', nombre: 'Salud', icono: '💊' },
    { id: 'ocio', nombre: 'Ocio', icono: '🎉' },
    { id: 'otros-gasto', nombre: 'Otros', icono: '📦' },
  ],
  ingreso: [
    { id: 'sueldo', nombre: 'Sueldo', icono: '💼' },
    { id: 'ventas', nombre: 'Ventas', icono: '🛒' },
    { id: 'otros-ingreso', nombre: 'Otros', icono: '💰' },
  ],
};
const TODAS = [...CATEGORIAS.gasto, ...CATEGORIAS.ingreso];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const SEGUNDOS_DESHACER = 4;

const $ = id => document.getElementById(id);
const estado = {
  tipo: 'gasto',
  entrada: '',        // lo tecleado, p. ej. "1.5"
  inicio: null,       // cuándo empezó a escribir, para medir los 3 segundos
  mes: new Date(),    // mes visible en Movimientos
  editando: null,
};

// ---------- Utilidades ----------

function categoria(id) {
  return TODAS.find(c => c.id === id) || { id, nombre: id, icono: '•' };
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

// ---------- Anotar ----------

function pintarTipo() {
  document.querySelectorAll('.tipo-btn').forEach(b => {
    const activo = b.dataset.tipo === estado.tipo;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-checked', activo);
  });
  document.body.dataset.tipo = estado.tipo;
  $('categorias').innerHTML = CATEGORIAS[estado.tipo].map(c =>
    `<button type="button" class="cat" data-cat="${c.id}"><span>${c.icono}</span>${c.nombre}</button>`
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

async function anotar(catId) {
  const centavos = aCentavos(estado.entrada);
  if (!centavos) {
    $('ayuda').textContent = 'Primero escribe el monto';
    $('ayuda').classList.add('alerta');
    vibrar([40, 40, 40]);
    return;
  }
  const mov = {
    id: nuevoId(),
    tipo: estado.tipo,
    monto: centavos,
    moneda: 'USD',
    categoria: catId,
    fecha: fechaLocal(),
    nota: '',
    frase: '',
    estado: 'listo',
    ms: estado.inicio ? Date.now() - estado.inicio : null,
    creado: new Date().toISOString(),
  };
  mov.editado = mov.creado;
  await DB.guardar(mov);
  vibrar(30);
  avisar(`Anotado: ${mov.tipo} ${dinero(mov.monto)}, ${categoria(catId).nombre.toLowerCase()}`,
    () => DB.borrar(mov.id));

  estado.entrada = '';
  estado.inicio = null;
  estado.tipo = 'gasto'; // gasto por defecto en cada registro
  $('ayuda').textContent = 'Escribe el monto y luego toca la categoría';
  pintarTipo();
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
  if (estado.vista === 'movimientos') pintarMovimientos();
}

// ---------- Movimientos ----------

function rangoMes(d) {
  const desde = new Date(d.getFullYear(), d.getMonth(), 1);
  const hasta = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return [fechaLocal(desde), fechaLocal(hasta)];
}

async function pintarMovimientos() {
  const m = estado.mes;
  $('mes-nombre').textContent = `${MESES[m.getMonth()]} ${m.getFullYear()}`;
  const movs = (await DB.entre(...rangoMes(m))).sort((a, b) => b.fecha.localeCompare(a.fecha));

  const suma = tipo => movs.filter(x => x.tipo === tipo).reduce((s, x) => s + x.monto, 0);
  const ingresos = suma('ingreso'), gastos = suma('gasto');
  $('total-ingresos').textContent = dinero(ingresos);
  $('total-gastos').textContent = dinero(gastos);
  $('total-saldo').textContent = dinero(ingresos - gastos);
  $('total-saldo').classList.toggle('negativo', ingresos < gastos);

  let dia = '', html = '';
  for (const x of movs) {
    const d = x.fecha.slice(0, 10);
    if (d !== dia) {
      dia = d;
      const f = new Date(d + 'T12:00:00');
      html += `<li class="dia">${DIAS[f.getDay()]} ${f.getDate()}</li>`;
    }
    const c = categoria(x.categoria);
    const signo = x.tipo === 'gasto' ? -1 : 1;
    html += `<li><button type="button" class="mov ${x.tipo}" data-id="${x.id}">
      <span class="mov-icono">${c.icono}</span>
      <span class="mov-texto"><strong>${c.nombre}</strong>${x.nota ? `<small>${escapar(x.nota)}</small>` : ''}</span>
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

function escapar(t) {
  return t.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ---------- Editor ----------

function opcionesCategoria(tipo, elegida) {
  const sel = $('editor-form').categoria;
  sel.innerHTML = CATEGORIAS[tipo].map(c =>
    `<option value="${c.id}">${c.icono} ${c.nombre}</option>`).join('');
  if (CATEGORIAS[tipo].some(c => c.id === elegida)) sel.value = elegida;
}

function abrirEditor(mov) {
  estado.editando = mov;
  const f = $('editor-form');
  f.tipo.value = mov.tipo;
  opcionesCategoria(mov.tipo, mov.categoria);
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
    categoria: f.categoria.value,
    fecha: f.fecha.value + ':00',
    nota: f.nota.value.trim(),
    estado: 'listo',
    editado: new Date().toISOString(),
  };
  await DB.guardar(mov);
  return true;
}

// ---------- Navegación ----------

function mostrar(vista) {
  estado.vista = vista;
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + vista));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  if (vista === 'movimientos') pintarMovimientos();
}

// ---------- Eventos ----------

$('teclado').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) teclear(b.dataset.k);
});

$('categorias').addEventListener('click', e => {
  const b = e.target.closest('.cat');
  if (b) anotar(b.dataset.cat);
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

$('mes-anterior').addEventListener('click', () => {
  estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1);
  pintarMovimientos();
});
$('mes-siguiente').addEventListener('click', () => {
  estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1);
  pintarMovimientos();
});

$('lista').addEventListener('click', e => {
  const b = e.target.closest('.mov');
  if (!b) return;
  const mov = $('lista').movs.find(x => x.id === b.dataset.id);
  if (mov) abrirEditor(mov);
});

$('editor-form').tipo.addEventListener('change', e => opcionesCategoria(e.target.value));
$('editor-form').monto.addEventListener('input', e => e.target.setCustomValidity(''));

$('editor-form').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'guardar') {
    e.preventDefault();
    if (await guardarEdicion()) {
      $('editor').close();
      pintarMovimientos();
    }
  }
});

$('editor-borrar').addEventListener('click', async () => {
  const mov = estado.editando;
  $('editor').close();
  await DB.borrar(mov.id);
  pintarMovimientos();
  avisar(`Borrado: ${categoria(mov.categoria).nombre} ${dinero(mov.monto)}`, () => DB.guardar(mov));
});

// Teclado físico (para probar en computadora).
document.addEventListener('keydown', e => {
  if (estado.vista !== 'anotar' || $('editor').open) return;
  if (/^\d$/.test(e.key)) teclear(e.key);
  else if (e.key === '.' || e.key === ',') teclear('.');
  else if (e.key === 'Backspace') teclear('borrar');
});

estado.vista = 'anotar';
pintarTipo();
pintarMonto();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
