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

// Animalitos: cada tipo y cada concepto tiene siempre el mismo, para reconocerlo sin leer.
// Los gastos hormiga (Otros) son, claro, la hormiga.
const ANIMAL_TIPO = { gasto: '🐜', ingreso: '🐝', inversion: '🐿️', libre: '🦋' };
const ANIMAL_CONCEPTO = {
  sueldo: '🦁', ganancia: '🦊', ventas: '🐓', comidas: '🐻', despensa: '🐹', gasolina: '🐆',
  salidas: '🦜', medicina: '🐨', compras: '🦚', amazon: '🐊', luz: '🐞', ahorro: '🐿️',
  juguetes: '🐼', 'bienes-raices': '🦫', libros: '🦉', otros: '🐜',
};
const ANIMALES = ['🐢', '🐬', '🦒', '🐘', '🦓', '🐧', '🦩', '🐇', '🦔', '🐑', '🦌', '🐙', '🦭', '🐫', '🦬',
  '🐕', '🐈', '🦙', '🐳', '🦅', '🦆', '🐸', '🦎', '🐝', '🦘', '🦡', '🐒', '🦦', '🐌', '🦀'];
function animal(c) {
  if (ANIMAL_CONCEPTO[c.id]) return ANIMAL_CONCEPTO[c.id];
  let h = 0;
  for (const ch of String(c.id)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return ANIMALES[h % ANIMALES.length];
}
const bicho = a => `<i class="bicho" aria-hidden="true">${a}</i>`;
const estado = {
  tipo: 'gasto',
  entrada: '',        // lo tecleado, p. ej. "1.5"
  inicio: null,       // cuándo empezó a escribir, para medir los 3 segundos
  mes: new Date(),    // mes visible en Movimientos y Resumen
  conceptos: [],
  editando: null,
  editandoConcepto: null,
  vista: 'anotar',
  negocios: [],       // hasta 3: { id, nombre, personaje, orden }
  espacio: leerEspacio(),  // '' = finanzas personales, o el id del negocio que se está viendo
  editandoNegocio: null,
};

// ---------- Personal y negocios ----------
// Cada movimiento y cada concepto tiene `negocio` ('' o sin campo = personal). Cada vista muestra solo
// lo del espacio elegido arriba, así lo del negocio no se mezcla con los gastos personales.
const MAX_NEGOCIOS = 3;
function leerEspacio() { try { return localStorage.getItem('espacio') || ''; } catch { return ''; } }
const negocioDe = x => (x && x.negocio) || '';
const delEspacio = (x, esp = estado.espacio) => negocioDe(x) === esp;
const conceptosDe = (esp = estado.espacio) => estado.conceptos.filter(c => delEspacio(c, esp));
const negocioPorId = id => estado.negocios.find(n => n.id === id) || null;
// En un negocio se habla de ventas, compras y ganancia en vez de ingresos, inversión y libre.
const NOMBRES = {
  personal: { gasto: 'Gasto', ingreso: 'Ingreso', inversion: 'Inversión', gastos: 'Gastos', ingresos: 'Ingresos', inversiones: 'Inversión', libre: 'Libre' },
  negocio: { gasto: 'Gasto', ingreso: 'Venta', inversion: 'Compra', gastos: 'Gastos', ingresos: 'Ventas', inversiones: 'Compras', libre: 'Ganancia' },
};
// Cada negocio tiene su personaje (también en su widget, con el nombre en una cinta dorada).
const PERSONAJES = { hormiga: 'Hormiga', oso: 'Oso hormiguero', leon: 'León' };
const imgPersonaje = (n, clase = '') => `<img class="${clase}" src="personaje-${escapar(n.personaje || 'hormiga')}.png" alt="">`;
// El primer personaje que no usa otro negocio.
function personajeLibre(menos) {
  const usados = new Set(estado.negocios.filter(n => n !== menos).map(n => n.personaje));
  return Object.keys(PERSONAJES).find(k => !usados.has(k)) || 'hormiga';
}
const nombres = (esp = estado.espacio) => (esp ? NOMBRES.negocio : NOMBRES.personal);

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
  estado.negocios = (await DB.negocios()).sort((a, b) => a.orden - b.orden);
  // Negocios creados antes de los personajes: toman uno libre.
  for (const n of estado.negocios) if (!PERSONAJES[n.personaje]) { n.personaje = personajeLibre(n); await DB.guardarNegocio(n); }
  if (estado.espacio && !negocioPorId(estado.espacio)) elegirEspacio('');
  pintarEspacios();
  contarAndroid();
}

function elegirEspacio(esp) {
  estado.espacio = esp;
  try { localStorage.setItem('espacio', esp); } catch { /* sin almacenamiento */ }
  estado.tipo = 'gasto';
}

// Fila de arriba: Personal y cada negocio. Solo aparece cuando hay al menos un negocio.
async function pintarEspacios() {
  const hay = estado.negocios.length > 0;
  document.body.classList.toggle('con-negocios', hay);
  $('espacios').hidden = !hay;
  if (!hay) return;
  // Frases por revisar de los otros espacios, para que no se pierdan de vista.
  const pend = {};
  for (const x of await DB.todos()) if (x.estado === 'pendiente') pend[negocioDe(x)] = (pend[negocioDe(x)] || 0) + 1;
  const chip = (id, icono, nombre) => `<button type="button" class="espacio${id === estado.espacio ? ' activo' : ''}"
      data-espacio="${escapar(id)}"${id !== estado.espacio && pend[id] ? ` data-cuenta="${pend[id]}"` : ''}>
      ${icono}${escapar(nombre)}</button>`;
  $('espacios').innerHTML = chip('', '<span>🐜</span>', 'Personal')
    + estado.negocios.map(n => chip(n.id, imgPersonaje(n), n.nombre)).join('');
}

// La app Android guarda la lista de negocios para que cada widget sepa a cuál anota.
function contarAndroid() {
  if (window.AndroidVoz && typeof AndroidVoz.negocios === 'function') {
    AndroidVoz.negocios(JSON.stringify(estado.negocios.map(n => ({ id: n.id, nombre: n.nombre, personaje: n.personaje }))));
  }
}

// ---------- Anotar ----------

function pintarTipo() {
  document.querySelectorAll('.tipo-btn').forEach(b => {
    const activo = b.dataset.tipo === estado.tipo;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-checked', activo);
  });
  document.body.dataset.tipo = estado.tipo;
  const nom = nombres();
  document.querySelectorAll('.tipo-btn').forEach(b => { b.lastChild.textContent = nom[b.dataset.tipo]; });
  // Los más usados primero, para que queden siempre a la vista.
  const lista = conceptosDe()
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
    negocio: estado.espacio,
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
  const movs = listos(await DB.entre(...rangoMes(estado.mes))).filter(x => delEspacio(x)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pendientes = (await DB.todos()).filter(x => x.estado === 'pendiente' && delEspacio(x)).sort((a, b) => b.fecha.localeCompare(a.fecha));

  let dia = '', html = '';
  if (pendientes.length) {
    html += `<li class="dia revisar">Por revisar (${pendientes.length})</li>`;
    for (const x of pendientes) {
      const c = x.concepto ? concepto(x.concepto) : { icono: '❓' };
      html += `<li><button type="button" class="mov pendiente" data-id="${x.id}">
        <span class="mov-icono con-bicho">${escapar(c.icono)}${x.concepto ? bicho(animal(c)) : ''}</span>
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
      <span class="mov-icono con-bicho">${escapar(c.icono)}${bicho(animal(c))}</span>
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

// "2026-10" para una fecha.
function mesDe(d) {
  return fechaLocal(d).slice(0, 7);
}

// Presupuesto que tenía el concepto ese mes. El historial guarda desde qué mes rige cada monto,
// así cambiarlo hoy no altera los meses pasados.
function presupuestoEn(c, mes) {
  const h = c.historial || {};
  const desde = Object.keys(h).filter(k => k <= mes).sort().pop();
  if (desde) return h[desde];
  return Object.keys(h).length ? 0 : c.presupuesto || 0;
}

// Agrupa el mes por tipo → categoría → concepto, con presupuesto y real.
function agrupar(movs, mes) {
  const real = {};
  for (const x of movs) real[x.concepto] = (real[x.concepto] || 0) + x.monto;
  const ids = new Set([...conceptosDe().filter(c => presupuestoEn(c, mes) > 0).map(c => c.id), ...Object.keys(real)]);
  const tipos = { ingreso: new Map(), gasto: new Map(), inversion: new Map() };
  for (const id of ids) {
    const c = concepto(id);
    const fila = { c, ppto: presupuestoEn(c, mes), real: real[id] || 0 };
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
  return `<h2 class="seccion">${bicho(ANIMAL_TIPO[tipo])}${titulo}</h2>` + cats.map(cat => `
    <details class="categoria">
      <summary>
        <div class="fila"><strong>${escapar(cat.nombre)}</strong><span>${dinero(cat.real)}<small> de ${dinero(cat.ppto)}</small></span></div>
        ${barra(cat.real, cat.ppto, tipo)}
      </summary>
      ${cat.conceptos.map(f => `
        <div class="concepto-fila">
          <div class="fila"><span>${escapar(f.c.icono)} ${escapar(f.c.nombre)} ${bicho(animal(f.c))}</span><span>${dinero(f.real)}<small> de ${dinero(f.ppto)}</small></span></div>
          ${barra(f.real, f.ppto, tipo)}
        </div>`).join('')}
    </details>`).join('');
}

async function pintarResumen() {
  pintarMes();
  const m = estado.mes;
  const movs = listos(await DB.entre(...rangoMes(m))).filter(x => delEspacio(x));
  const g = agrupar(movs, mesDe(m));
  const nom = nombres();
  const suma = (cats, campo) => cats.reduce((s, c) => s + c[campo], 0);
  const ing = { real: suma(g.ingreso, 'real'), ppto: suma(g.ingreso, 'ppto') };
  const egr = { real: suma(g.gasto, 'real'), ppto: suma(g.gasto, 'ppto') };
  const inv = { real: suma(g.inversion, 'real'), ppto: suma(g.inversion, 'ppto') };
  const libre = ing.real - egr.real - inv.real;
  const pctInvertido = ing.real ? Math.round(inv.real / ing.real * 100) : 0;

  // 1. ¿A dónde se fue el ingreso? Gastos, inversión y lo que queda libre.
  const reparto = Graficos.dona([
    { nombre: nom.gastos, valor: egr.real, color: 'var(--c-gasto)' },
    { nombre: nom.inversiones, valor: inv.real, color: 'var(--c-inversion)' },
    { nombre: nom.libre, valor: Math.max(libre, 0), color: 'var(--c-libre)' },
  ].filter(p => p.valor > 0), { titulo: libre < 0 ? (estado.espacio ? 'Pérdida' : 'Te faltan') : nom.libre, valor: dinero(Math.abs(libre)) });

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
  const seis = listos(await DB.entre(fechaLocal(inicio), rangoMes(m)[1])).filter(x => delEspacio(x));
  const meses = Array.from({ length: 6 }, (_, k) => {
    const f = new Date(inicio.getFullYear(), inicio.getMonth() + k, 1);
    const clave = fechaLocal(f).slice(0, 7);
    const delMes = seis.filter(x => x.fecha.startsWith(clave));
    const t = tipo => delMes.filter(x => x.tipo === tipo).reduce((s, x) => s + x.monto, 0);
    return { nombre: MESES[f.getMonth()].slice(0, 3), valores: [t('ingreso'), t('gasto'), t('inversion')] };
  });
  const historial = meses.some(x => x.valores.some(v => v)) ? Graficos.barras(meses, [
    { nombre: nom.ingresos, color: 'var(--c-ingreso)' },
    { nombre: nom.gastos, color: 'var(--c-gasto)' },
    { nombre: nom.inversiones, color: 'var(--c-inversion)' },
  ]) : '';

  const tarjeta = (titulo, cuerpo, pie = '') => cuerpo
    ? `<section class="tarjeta"><h2>${titulo}</h2>${cuerpo}${pie ? `<p class="nota">${pie}</p>` : ''}</section>` : '';

  $('resumen').innerHTML = `
    <div class="totales">
      <div><span>${bicho(ANIMAL_TIPO.ingreso)} ${nom.ingresos}</span><strong class="ingreso">${dinero(ing.real)}</strong><small>Ppto ${dinero(ing.ppto)}</small></div>
      <div><span>${bicho(ANIMAL_TIPO.gasto)} ${nom.gastos}</span><strong class="gasto">${dinero(egr.real)}</strong><small>Ppto ${dinero(egr.ppto)}</small></div>
      <div><span>${bicho(ANIMAL_TIPO.inversion)} ${nom.inversiones}</span><strong class="inversion">${dinero(inv.real)}</strong><small>Ppto ${dinero(inv.ppto)}</small></div>
      <div><span>${bicho(ANIMAL_TIPO.libre)} ${nom.libre}</span><strong class="${libre < 0 ? 'gasto' : ''}">${dinero(libre)}</strong><small>Ppto ${dinero(ing.ppto - egr.ppto - inv.ppto)}</small></div>
    </div>
    ${estado.espacio
      ? tarjeta('¿A dónde se fueron las ventas?', reparto, `Las compras de mercadería son el ${pctInvertido}% de lo vendido. Toca la dona para ver cada parte.`)
      : tarjeta('¿A dónde se fue tu ingreso?', reparto, `Inviertes el ${pctInvertido}% de lo que ganas. Toca la dona para ver cada parte.`)}
    ${tarjeta('Gastos del mes, día a día', curva, `${frase} La línea punteada es el presupuesto repartido parejo en el mes.`)}
    ${tarjeta('¿En qué gastas más?', donaGastos)}
    ${tarjeta('Últimos 6 meses', historial, 'Toca un mes para ver los montos.')}
    <p class="nota centro">${nom.gastos}: ${diferencia(egr.real, egr.ppto, 'gasto')}. ${nom.inversiones}: ${diferencia(inv.real, inv.ppto, 'inversion')}. ${nom.ingresos}: ${diferencia(ing.real, ing.ppto, 'ingreso')}.</p>
    ${bloqueTipo(`${nom.gastos} por categoría`, g.gasto, 'gasto')}
    ${bloqueTipo(`${nom.inversiones} por categoría`, g.inversion, 'inversion')}
    ${bloqueTipo(`${nom.ingresos} por categoría`, g.ingreso, 'ingreso')}`;
  Graficos.activar($('resumen'));
}

// ---------- Proyección ----------

// Proyección en tres preguntas simples: ¿cuánto llevo?, ¿cómo cierro el mes?, ¿mi plan cuadra?
// Abajo, los presupuestos por tipo (plegables). Lo demás (negocios, sesión, exportar) va en Ajustes.
const DIAS_PARA_PROYECTAR = 7;  // antes de esto, multiplicar lo gastado da números sin sentido

async function pintarProyeccion() {
  const hoy = new Date();
  const totalDias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const quedan = Math.max(totalDias - hoy.getDate(), 0);
  const nom = nombres();
  const ppto = tipo => conceptosDe().filter(c => c.tipo === tipo).reduce((s, c) => s + (c.presupuesto || 0), 0);
  const p = { ingreso: ppto('ingreso'), gasto: ppto('gasto'), inversion: ppto('inversion') };
  const movs = listos(await DB.entre(...rangoMes(hoy))).filter(x => delEspacio(x));
  const real = tipo => movs.filter(x => x.tipo === tipo).reduce((s, x) => s + x.monto, 0);
  const r = { ingreso: real('ingreso'), gasto: real('gasto'), inversion: real('inversion') };
  const neg = negocioPorId(estado.espacio);
  const fila = (nombre, valor, clase = '') =>
    `<div class="fila linea"><span>${nombre}</span><strong class="${clase}">${valor}</strong></div>`;

  // 1. ¿Cuánto llevo gastado?
  let llevo;
  if (p.gasto) {
    const resta = p.gasto - r.gasto;
    const porDia = Math.round(Math.max(resta, 0) / Math.max(quedan, 1));
    llevo = `<div class="grande"><strong class="gasto">${dinero(r.gasto)}</strong> <span>de ${dinero(p.gasto)}</span></div>
      ${barra(r.gasto, p.gasto, 'gasto')}
      <p class="veredicto ${resta < 0 ? 'critico' : 'bien'}">${resta < 0
        ? `Te pasaste ${dinero(-resta)} del presupuesto.`
        : `Te quedan ${dinero(resta)}: puedes gastar ${dinero(porDia)} por día${quedan ? ` los ${quedan} días que faltan` : ''}.`}</p>`;
  } else {
    llevo = `<div class="grande"><strong class="gasto">${dinero(r.gasto)}</strong></div>
      <p class="nota">Ponle presupuesto a tus gastos (abajo) para saber cuánto puedes gastar por día.</p>`;
  }

  // 2. ¿Cómo cierro el mes? Solo cuando ya hay días suficientes para que el ritmo signifique algo.
  let cierre;
  const ingresoCierre = Math.max(r.ingreso, p.ingreso);
  const inversionCierre = Math.max(r.inversion, p.inversion);
  if (hoy.getDate() < DIAS_PARA_PROYECTAR) {
    cierre = `<p class="nota">Desde el día ${DIAS_PARA_PROYECTAR} del mes te digo cómo cerrarías a este ritmo. Antes es muy pronto: un gasto grande al inicio daría un cálculo exagerado.</p>`;
  } else {
    const gastoCierre = Math.round(r.gasto / hoy.getDate() * totalDias);
    const libreCierre = ingresoCierre - gastoCierre - inversionCierre;
    cierre = `${fila(`${nom.gastos} al terminar el mes`, dinero(gastoCierre), p.gasto && gastoCierre > p.gasto ? 'critico' : 'gasto')}
      ${fila(`${nom.libre} al terminar el mes`, dinero(libreCierre), libreCierre < 0 ? 'critico' : 'ingreso')}
      <p class="veredicto ${p.gasto && gastoCierre > p.gasto ? 'critico' : 'bien'}">${!p.gasto ? 'Calculado con lo que llevas gastado por día.'
        : gastoCierre > p.gasto ? `Vas a pasarte unos ${dinero(gastoCierre - p.gasto)}. Baja un poco el gasto diario.`
        : 'Vas bien: a este ritmo no te pasas del presupuesto.'}</p>`;
  }

  // 3. ¿Mi plan del mes cuadra? Lo esperado según los presupuestos.
  const libreP = p.ingreso - p.gasto - p.inversion;
  const plan = `${fila(`${nom.ingresos} esperados`, dinero(p.ingreso), 'ingreso')}
    ${fila(`− ${nom.gastos}`, dinero(p.gasto), 'gasto')}
    ${fila(`− ${nom.inversiones}`, dinero(p.inversion), 'inversion')}
    <div class="fila linea total"><span>= ${nom.libre}</span><strong class="${libreP < 0 ? 'critico' : ''}">${dinero(libreP)}</strong></div>
    ${libreP < 0 ? `<p class="veredicto critico">Tu plan no cuadra: ${estado.espacio ? 'gastos y compras suman' : 'gastos e inversión suman'} ${dinero(-libreP)} más de lo que esperas ${estado.espacio ? 'vender' : 'ganar'}. Baja algún presupuesto abajo.</p>` : ''}`;

  $('proyeccion').innerHTML = `
    <header class="proy-cabeza">
      <h1 class="titulo">${MESES[hoy.getMonth()].replace(/^./, l => l.toUpperCase())}${neg ? ` · ${escapar(neg.nombre)}` : ''}</h1>
      <button type="button" id="abrir-config" class="engranaje" aria-label="Ajustes">⚙️ Ajustes</button>
    </header>
    <section class="tarjeta"><h2>¿Cuánto llevas gastado?</h2>${llevo}</section>
    <section class="tarjeta"><h2>¿Cómo cerrarías el mes?</h2>${cierre}</section>
    <section class="tarjeta"><h2>Tu plan del mes</h2>${plan}</section>`;
}

function pintarAjustes() {
  pintarProyeccion();
  // Presupuestos por tipo, plegables: Gastos abierto, lo demás cerrado para no abrumar.
  const nom = nombres();
  const orden = [['gasto', nom.gastos], ['ingreso', nom.ingresos], ['inversion', nom.inversiones]];
  $('ajustes-lista').innerHTML = orden.map(([tipo, titulo]) => {
    const lista = conceptosDe().filter(c => c.tipo === tipo)
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.orden - b.orden);
    if (!lista.length) return '';
    const total = lista.reduce((s, c) => s + (c.presupuesto || 0), 0);
    return `<details class="grupo-ppto"${tipo === 'gasto' ? ' open' : ''}>
      <summary><span>${bicho(ANIMAL_TIPO[tipo])} ${titulo}</span><strong>${dinero(total)}<small> al mes</small></strong></summary>
      <ul class="lista">${lista.map(c => `
        <li><button type="button" class="mov" data-concepto="${escapar(c.id)}">
          <span class="mov-icono con-bicho">${escapar(c.icono)}${bicho(animal(c))}</span>
          <span class="mov-texto"><strong>${escapar(c.nombre)}</strong><small>${escapar(c.categoria)}${c.oculto ? ' · oculto en Anotar' : ''}</small></span>
          <span class="mov-monto">${c.presupuesto ? dinero(c.presupuesto) : '—'}</span>
        </button></li>`).join('')}</ul>
    </details>`;
  }).join('');
}

function pintarConfig() {
  Voz.pintarAjustes();
  pintarNegocios();
}

// ---------- Mis negocios ----------

const widgetNativo = () => window.AndroidVoz && typeof AndroidVoz.ponerWidget === 'function';

function pintarNegocios() {
  const n = negocioPorId(estado.espacio);
  $('negocios-lista').innerHTML = estado.negocios.map(x => `
    <li><button type="button" class="mov" data-negocio="${escapar(x.id)}">
      <span class="mov-icono">${imgPersonaje(x, 'personaje-lista')}</span>
      <span class="mov-texto"><strong>${escapar(x.nombre)}</strong><small>${x.id === estado.espacio ? 'Lo estás viendo' : 'Toca para cambiar el nombre'}</small></span>
    </button></li>`).join('');
  $('nuevo-negocio').hidden = estado.negocios.length >= MAX_NEGOCIOS;
  // El widget propio de cada espacio: en la app Android se pone con un toque.
  $('poner-widget').hidden = !widgetNativo();
  $('poner-widget').textContent = `Poner widget de ${n ? n.nombre : 'Personal'} en la pantalla`;
  $('widget-nota').textContent = widgetNativo()
    ? 'O mantén presionada la pantalla de inicio → Widgets → MIG, y elige para quién es.'
    : 'En la app Android de MIG puedes poner un widget de voz para cada negocio.';
}

function abrirNegocio(n) {
  estado.editandoNegocio = n;
  const f = $('negocio-form');
  f.nombre.value = n ? n.nombre : '';
  f.personaje.value = n ? n.personaje : personajeLibre();
  $('negocio-titulo').textContent = n ? 'Negocio' : 'Nuevo negocio';
  $('negocio-borrar').hidden = !n;
  $('editor-negocio').showModal();
}

async function guardarNegocio() {
  const f = $('negocio-form');
  const previo = estado.editandoNegocio;
  const n = {
    ...(previo || { id: 'n' + Date.now().toString(36), orden: estado.negocios.length }),
    nombre: f.nombre.value.trim().slice(0, 30),
    personaje: PERSONAJES[f.personaje.value] ? f.personaje.value : 'hormiga',
  };
  await DB.guardarNegocio(n);
  // Un negocio nuevo trae sus conceptos y se abre de una vez.
  if (!previo) {
    for (const c of DB.conceptosNegocio(n.id, estado.conceptos.length)) await DB.guardarConcepto(c);
    elegirEspacio(n.id);
  }
  await cargarConceptos();
  return n;
}

// Un negocio se borra solo si no tiene movimientos (como los conceptos); se van también sus conceptos.
async function borrarNegocio() {
  const n = estado.editandoNegocio;
  const usados = (await DB.todos()).filter(x => negocioDe(x) === n.id).length;
  if (usados) {
    avisar(`«${n.nombre}» tiene ${usados} movimiento${usados > 1 ? 's' : ''}. Bórralos primero (abajo, "Empezar de cero" dentro del negocio).`);
    return;
  }
  $('editor-negocio').close();
  const suyos = conceptosDe(n.id);
  for (const c of suyos) await DB.borrarConcepto(c.id);
  await DB.borrarNegocio(n.id);
  await cargarConceptos();
  repintar();
  avisar(`Negocio borrado: ${n.nombre}`, async () => {
    await DB.guardarNegocio(n);
    for (const c of suyos) await DB.guardarConcepto(c);
    await cargarConceptos();
  });
}

function abrirConcepto(c, nuevo = {}) {
  estado.editandoConcepto = c;
  const f = $('concepto-form');
  const categorias = [...new Set(conceptosDe().map(x => x.categoria))].sort();
  $('lista-categorias').innerHTML = categorias.map(x => `<option value="${escapar(x)}">`).join('');
  const tipo = c ? c.tipo : nuevo.tipo || 'gasto';
  // Categoría propuesta: la más usada de ese tipo ("Otros" si empatan).
  const cuenta = {};
  for (const x of conceptosDe().filter(x => x.tipo === tipo)) cuenta[x.categoria] = (cuenta[x.categoria] || 0) + 1;
  const comun = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || (b === 'Otros') - (a === 'Otros'))[0] || '';
  f.nombre.value = c ? c.nombre : nuevo.nombre || '';
  f.icono.value = c ? c.icono : '';
  f.tipo.value = tipo;
  f.categoria.value = c ? c.categoria : (nuevo.nombre || nuevo.tipo) ? comun : '';
  f.presupuesto.value = c ? (c.presupuesto / 100).toFixed(2) : '';
  f.oculto.checked = c ? !!c.oculto : false;
  $('concepto-borrar').hidden = !c;
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
  // El monto nuevo rige desde este mes; los meses pasados guardan el que tenían.
  const mes = mesDe(new Date());
  let historial = previo ? { ...(previo.historial || {}) } : {};
  if (!previo || previo.presupuesto !== ppto) {
    if (previo && !Object.keys(historial).length) historial['0000-00'] = previo.presupuesto || 0;
    for (const k of Object.keys(historial)) if (k > mes) delete historial[k];
    historial[mes] = ppto;
  }
  const c = {
    ...(previo || { id: nuevoId(), orden: estado.conceptos.length, usos: 0, negocio: estado.espacio }),
    nombre: f.nombre.value.trim(),
    icono: f.icono.value.trim() || '•',
    tipo: f.tipo.value,
    categoria: f.categoria.value.trim(),
    presupuesto: ppto,
    historial,
    oculto: f.oculto.checked,
  };
  await DB.guardarConcepto(c);
  await cargarConceptos();
  return c;
}

// ---------- Exportar a Excel ----------

async function exportar() {
  const movs = listos(await DB.todos()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const filas = [];
  const meses = new Set();
  for (const x of movs) {
    const c = concepto(x.concepto);
    meses.add(x.fecha.slice(0, 7));
    filas.push([x.fecha.slice(0, 10), c.tipo, c.categoria, c.nombre, 0, x.monto, x.nota || '', negocioDe(x)]);
  }
  // Como en el Excel: una fila de presupuesto por concepto el día 1 de cada mes, con monto 0.
  for (const m of meses) {
    for (const c of estado.conceptos) {
      if (presupuestoEn(c, m) > 0) filas.push([m + '-01', c.tipo, c.categoria, c.nombre, presupuestoEn(c, m), 0, '', negocioDe(c)]);
    }
  }
  filas.sort((a, b) => a[0].localeCompare(b[0]));
  // Columna Negocio: "Personal" o el nombre del negocio, para filtrar en Excel.
  const datos = filas.map(([fecha, tipo, cat, con, ppto, monto, nota, neg]) => [
    { fecha }, MESES[Number(fecha.slice(5, 7)) - 1].replace(/^./, l => l.toUpperCase()), TIPOS[tipo].excel,
    cat, con, ppto / 100, monto / 100, nota, neg ? (negocioPorId(neg) || { nombre: 'Negocio borrado' }).nombre : 'Personal',
  ]);
  const encabezado = ['Fecha', 'Mes', 'Tipo', 'Categoria', 'Concepto', 'Presupuesto', 'Monto', 'Nota', 'Negocio'];
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
  const esp = negocioDe(estado.editando);
  for (const c of conceptosDe(esp).filter(c => c.tipo === tipo)) {
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
  // Si la frase nombra algo que no tiene concepto (por ejemplo tu negocio), se ofrece crearlo.
  const dudosa = mov.ia === 'duda' && (!mov.concepto || /(^|-)otros$/.test(mov.concepto));
  const sugerido = mov.frase && dudosa ? Voz.nombreSugerido(mov.frase) : '';
  const existe = conceptosDe(negocioDe(mov)).some(c => c.nombre.toLowerCase() === sugerido.toLowerCase());
  $('editor-nuevo').textContent = `¿Es algo nuevo? + Crear concepto «${sugerido}»`;
  $('editor-nuevo').hidden = !sugerido || existe;
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
  // Lo que confirmas o corriges le sirve de ejemplo a la IA para las próximas frases.
  if (mov.frase) Voz.aprender(mov.frase, mov);
  return true;
}

// Cuántas frases esperan revisión: se ve como un número sobre Movimientos.
async function pintarPendientes() {
  const pendientes = (await DB.todos()).filter(x => x.estado === 'pendiente');
  const aqui = pendientes.filter(x => delEspacio(x)).length;
  const b = document.querySelector('.nav-btn[data-vista="movimientos"]');
  if (aqui) b.dataset.cuenta = aqui; else delete b.dataset.cuenta;
  if (estado.negocios.length) pintarEspacios();
  // Si el widget está ordenando una frase por detrás, se mira de nuevo en un rato.
  clearTimeout(pintarPendientes.reloj);
  if (pendientes.some(x => x.ia === 'enviando')) {
    pintarPendientes.reloj = setTimeout(() => {
      Voz.procesarPendientes();  // las que llevan más de un minuto se vuelven a mandar desde aquí
      if (!document.querySelector('dialog[open]') && !arrastre) repintar(); else pintarPendientes();
    }, 3000);
  }
}

// ---------- Navegación ----------

function repintar() {
  if (estado.vista === 'anotar') pintarTipo();
  if (estado.vista === 'movimientos') pintarMovimientos();
  if (estado.vista === 'resumen') pintarResumen();
  if (estado.vista === 'ajustes') pintarAjustes();
  if (estado.vista === 'config') pintarConfig();
  pintarPendientes();
}

function mostrar(vista) {
  estado.vista = vista;
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + vista));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('activo', b.dataset.vista === (vista === 'config' ? 'ajustes' : vista)));
  repintar();
  seguirAtras();
}

// Botón o gesto de atrás: cierra la ventana abierta, luego vuelve a Anotar, y recién ahí sale.
// Para eso se deja una entrada en el historial mientras no estemos en Anotar sin ventanas.
function enInicio() {
  return estado.vista === 'anotar' && !document.querySelector('dialog[open]');
}

function seguirAtras() {
  const marcado = history.state && history.state.dentro;
  if (!enInicio() && !marcado) history.pushState({ dentro: true }, '');
  else if (enInicio() && marcado) history.back();
}

addEventListener('popstate', () => {
  const abierta = [...document.querySelectorAll('dialog[open]')].pop();
  // La de la contraseña no se cierra: sin contraseña no se usa la app.
  if (abierta) { if (abierta.id !== 'bienvenida') abierta.close(); }
  else if (estado.vista === 'config') mostrar('ajustes');
  else if (estado.vista !== 'anotar') mostrar('anotar');
  seguirAtras();
});

new MutationObserver(seguirAtras)
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

// ---------- Eventos ----------

$('teclado').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) teclear(b.dataset.k);
});

// Entre el teclado y los conceptos: crear uno de este tipo sin ir a Proyección.
$('anotar-nuevo-concepto').addEventListener('click', () => abrirConcepto(null, { tipo: estado.tipo }));
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
  if (!b || b.dataset.arrastrado) return;
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

async function borrarMov(mov) {
  await DB.borrar(mov.id);
  repintar();
  avisar(`Borrado: ${mov.concepto ? concepto(mov.concepto).nombre : '«' + mov.frase + '»'} ${dinero(mov.monto)}`, () => DB.guardar(mov));
}

$('editor-borrar').addEventListener('click', () => {
  $('editor').close();
  borrarMov(estado.editando);
});

// Deslizar una fila a la izquierda la borra (con Deshacer en el aviso).
let arrastre = null;
$('lista').addEventListener('pointerdown', e => {
  const b = e.target.closest('.mov');
  if (b) arrastre = { b, x: e.clientX, y: e.clientY, dx: 0, moviendo: false };
});
$('lista').addEventListener('pointermove', e => {
  if (!arrastre) return;
  const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
  if (!arrastre.moviendo) {
    if (Math.abs(dy) > 10) { arrastre = null; return; }
    if (dx > -10) return;
    arrastre.moviendo = true;
    arrastre.b.setPointerCapture(e.pointerId);
    arrastre.b.parentElement.classList.add('deslizando');
  }
  arrastre.dx = Math.min(0, dx);
  arrastre.b.style.transform = `translateX(${arrastre.dx}px)`;
});
const soltar = () => {
  if (!arrastre) return;
  const { b, dx, moviendo } = arrastre;
  arrastre = null;
  if (!moviendo) return;
  b.dataset.arrastrado = '1';  // para que el click que sigue no abra el editor
  setTimeout(() => delete b.dataset.arrastrado, 50);
  const mov = $('lista').movs.find(x => x.id === b.dataset.id);
  if (mov && dx < -b.offsetWidth * 0.35) {
    b.style.transition = 'transform .15s';
    b.style.transform = 'translateX(-100%)';
    setTimeout(() => borrarMov(mov), 150);
  } else {
    b.style.transition = 'transform .15s';
    b.style.transform = '';
    setTimeout(() => { b.style.transition = ''; b.parentElement.classList.remove('deslizando'); }, 150);
  }
};
$('lista').addEventListener('pointerup', soltar);
$('lista').addEventListener('pointercancel', soltar);

$('ajustes-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-concepto]');
  if (b) abrirConcepto(concepto(b.dataset.concepto));
});
$('nuevo-concepto').addEventListener('click', () => abrirConcepto(null));
$('proyeccion').addEventListener('click', e => { if (e.target.closest('#abrir-config')) mostrar('config'); });
$('volver-proyeccion').addEventListener('click', () => mostrar('ajustes'));
// Un concepto solo se borra si no tiene movimientos; si tiene, se puede ocultar.
$('concepto-borrar').addEventListener('click', async () => {
  const c = estado.editandoConcepto;
  const usados = (await DB.todos()).filter(x => x.concepto === c.id).length;
  if (usados) {
    avisar(`«${c.nombre}» tiene ${usados} movimiento${usados > 1 ? 's' : ''}: mejor márcalo "Ocultar en Anotar".`);
    return;
  }
  $('editor-concepto').close();
  await DB.borrarConcepto(c.id);
  await cargarConceptos();
  repintar();
  avisar(`Concepto borrado: ${c.nombre}`, async () => { await DB.guardarConcepto(c); await cargarConceptos(); repintar(); });
});
$('editor-nuevo').addEventListener('click', () => abrirConcepto(null, {
  nombre: Voz.nombreSugerido(estado.editando.frase),
  tipo: $('editor-form').tipo.value,
}));
$('concepto-form').presupuesto.addEventListener('input', e => e.target.setCustomValidity(''));
$('concepto-form').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'guardar') {
    e.preventDefault();
    const c = await guardarConcepto();
    if (c) {
      $('editor-concepto').close();
      // Creado desde "Revisar y confirmar": queda elegido en el movimiento.
      if ($('editor').open) {
        $('editor-form').tipo.value = c.tipo;
        opcionesConcepto(c.tipo, c.id);
        $('editor-nuevo').hidden = true;
      }
      repintar();
    }
  }
});

$('exportar').addEventListener('click', exportar);

// ---------- Deslizar a los lados ----------
// Deslizar el dedo a la izquierda o derecha cambia entre Personal y los negocios (da la vuelta).
// Empieza lejos de los bordes (Android los usa para Atrás) y no en Movimientos, donde deslizar borra.
function cambiarEspacio(paso) {
  const ids = ['', ...estado.negocios.map(n => n.id)];
  if (ids.length < 2) return;
  const i = (ids.indexOf(estado.espacio) + paso + ids.length) % ids.length;
  elegirEspacio(ids[i]);
  estado.entrada = '';
  estado.inicio = null;
  pintarMonto();
  pintarEspacios();
  repintar();
  const n = negocioPorId(ids[i]);
  avisar(n ? `${n.nombre}` : 'Personal');
  const v = document.querySelector('.vista.activa');
  if (v) { v.classList.remove('entra-izq', 'entra-der'); void v.offsetWidth; v.classList.add(paso > 0 ? 'entra-izq' : 'entra-der'); }
  vibrar(15);
}

let gesto = null;
document.querySelector('main').addEventListener('touchstart', e => {
  const t = e.touches[0];
  gesto = null;
  if (e.touches.length !== 1 || estado.vista === 'movimientos' || document.querySelector('dialog[open]')) return;
  if (t.clientX < 32 || t.clientX > innerWidth - 32) return;
  if (e.target.closest('input, textarea, select, .grafico, .espacios')) return;
  gesto = { x: t.clientX, y: t.clientY, t: Date.now() };
}, { passive: true });
document.querySelector('main').addEventListener('touchend', e => {
  if (!gesto) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - gesto.x, dy = t.clientY - gesto.y;
  const rapido = Date.now() - gesto.t < 700;
  gesto = null;
  if (rapido && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) cambiarEspacio(dx < 0 ? 1 : -1);
}, { passive: true });

$('espacios').addEventListener('click', e => {
  const b = e.target.closest('[data-espacio]');
  if (!b || b.dataset.espacio === estado.espacio) return;
  elegirEspacio(b.dataset.espacio);
  estado.entrada = '';
  estado.inicio = null;
  pintarMonto();
  pintarEspacios();
  repintar();
});
$('nuevo-negocio').addEventListener('click', () => abrirNegocio(null));
$('negocios-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-negocio]');
  if (b) abrirNegocio(negocioPorId(b.dataset.negocio));
});
$('negocio-borrar').addEventListener('click', borrarNegocio);
$('negocio-form').addEventListener('submit', async e => {
  if (!e.submitter || e.submitter.value !== 'guardar') return;
  e.preventDefault();
  if (!$('negocio-form').nombre.value.trim()) { $('negocio-form').nombre.reportValidity(); return; }
  const nuevo = !estado.editandoNegocio;
  const n = await guardarNegocio();
  $('editor-negocio').close();
  repintar();
  avisar(nuevo ? `Listo: ${n.nombre} tiene su propio panel. Arriba cambias entre Personal y el negocio.` : `Guardado: ${n.nombre}`);
});
$('poner-widget').addEventListener('click', () => {
  const n = negocioPorId(estado.espacio);
  AndroidVoz.ponerWidget(n ? n.id : '');
});

// Empezar de cero: borra los movimientos (con Deshacer); conceptos y presupuestos se quedan.
// Con negocios, borra solo los del espacio que se está viendo (Personal o ese negocio).
$('reiniciar').addEventListener('click', async () => {
  const n = (await DB.todos()).filter(x => delEspacio(x)).length;
  if (!n) { avisar('No hay movimientos que borrar.'); return; }
  const donde = estado.espacio ? ` de ${negocioPorId(estado.espacio).nombre}` : estado.negocios.length ? ' personales' : '';
  $('reinicio-texto').textContent = `Se borran ${n} movimiento${n > 1 ? 's' : ''}${donde}. Si quieres guardarlos, descarga antes el CSV.`;
  $('confirmar-reinicio').returnValue = '';
  $('confirmar-reinicio').showModal();
});
$('confirmar-reinicio').addEventListener('close', async () => {
  if ($('confirmar-reinicio').returnValue !== 'borrar') return;
  const copia = (await DB.todos()).filter(x => delEspacio(x));
  for (const m of copia) await DB.borrar(m.id);
  repintar();
  avisar(`Listo: se borraron ${copia.length} movimientos.`, async () => {
    for (const m of copia) await DB.guardar(m);
    repintar();
  });
});

// Teclado físico (para probar en computadora).
document.addEventListener('keydown', e => {
  if (estado.vista !== 'anotar' || document.querySelector('dialog[open]')) return;
  if (/^\d$/.test(e.key)) teclear(e.key);
  else if (e.key === '.' || e.key === ',') teclear('.');
  else if (e.key === 'Backspace') teclear('borrar');
});

// Arranque: Voz.oido espera a que estén cargados los conceptos.
const arranque = (async () => {
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
