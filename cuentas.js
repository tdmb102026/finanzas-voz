// Herramientas de Proyección: metas de ahorro, deudas y préstamos, fijos del mes y pasar plata
// entre Personal y los negocios. Usa lo de app.js: estado, DB, avisar, dinero, barra, repintar…
const Cuentas = (() => {
  const nombreEspacio = id => (id ? (negocioPorId(id) || { nombre: 'Negocio borrado' }).nombre : 'Personal');
  const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const fechaCorta = f => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;

  // ---------- Metas de ahorro ----------
  // Un concepto con meta (en centavos) junta lo anotado en él en todos los meses.
  function pintarMetas(todos) {
    const metas = conceptosDe().filter(c => c.meta > 0);
    const junto = {};
    for (const x of listos(todos)) if (x.concepto) junto[x.concepto] = (junto[x.concepto] || 0) + x.monto;
    const filas = metas.map(c => {
      const lleva = junto[c.id] || 0, falta = c.meta - lleva;
      return `<li><button type="button" class="meta" data-concepto="${escapar(c.id)}">
        <div class="fila"><span>${escapar(c.icono)} ${escapar(c.nombre)}</span><span><strong>${dinero(lleva)}</strong><small> de ${dinero(c.meta)}</small></span></div>
        ${barra(lleva, c.meta, 'inversion')}
        <small>${falta > 0 ? `Te faltan ${dinero(falta)}` : '¡Lo lograste! 🎉'}</small>
      </button></li>`;
    });
    return `<section class="tarjeta herramienta">
      <h2>🎯 Metas de ahorro</h2>
      ${filas.length ? `<ul class="lista metas">${filas.join('')}</ul>`
        : `<p class="nota arriba">Ponle una meta a lo que ahorras: un viaje, una moto, un fondo para emergencias. Cada vez que anotes en ese concepto (en ${nombres().inversion}), la meta avanza.</p>`}
      <button type="button" class="mini-nuevo" id="nueva-meta">＋ Nueva meta</button>
    </section>`;
  }

  // ---------- Deudas y préstamos ----------
  // Van aparte de los movimientos: prestar o pedir prestado no es gasto ni ingreso.
  const pagado = d => (d.abonos || []).reduce((s, a) => s + a.monto, 0);
  const saldo = d => d.monto - pagado(d);
  const deudasDe = async (esp = estado.espacio) => (await DB.deudas()).filter(d => delEspacio(d, esp));

  function pintarDeudas(lista) {
    const abiertas = lista.filter(d => saldo(d) > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pagadas = lista.filter(d => saldo(d) <= 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const total = s => abiertas.filter(d => d.sentido === s).reduce((t, d) => t + saldo(d), 0);
    const fila = d => `<li><button type="button" class="mov deuda ${d.sentido}" data-deuda="${escapar(d.id)}">
        <span class="mov-icono">${d.sentido === 'medeben' ? '📥' : '📤'}</span>
        <span class="mov-texto"><strong>${d.sentido === 'medeben' ? `${escapar(d.persona)} te debe` : `Le debes a ${escapar(d.persona)}`}</strong>
          <small>${saldo(d) <= 0 ? 'Pagada ✓' : pagado(d) ? `${d.sentido === 'medeben' ? 'Ya pagó' : 'Ya pagaste'} ${dinero(pagado(d))} de ${dinero(d.monto)}` : `Desde el ${fechaCorta(d.fecha)}`}${d.nota ? ' · ' + escapar(d.nota) : ''}</small></span>
        <span class="mov-monto">${dinero(saldo(d) > 0 ? saldo(d) : d.monto)}</span>
      </button></li>`;
    return `<section class="tarjeta herramienta">
      <h2>🤝 Deudas y préstamos</h2>
      ${abiertas.length ? `<div class="deuda-totales">
          <div><span>Te deben</span><strong class="ingreso">${dinero(total('medeben'))}</strong></div>
          <div><span>Debes</span><strong class="gasto">${dinero(total('debo'))}</strong></div>
        </div><ul class="lista">${abiertas.map(fila).join('')}</ul>`
        : '<p class="nota arriba">Anota lo que prestas y lo que te prestan, y los pagos que van llegando. No cambia tus gastos ni ingresos del mes.</p>'}
      ${pagadas.length ? `<details class="avanzado"><summary>Pagadas (${pagadas.length})</summary><ul class="lista">${pagadas.map(fila).join('')}</ul></details>` : ''}
      <button type="button" class="mini-nuevo" id="nueva-deuda">＋ Anotar deuda o préstamo</button>
    </section>`;
  }

  let deudaAbierta = null;
  function abrirDeuda(d, sentido = 'medeben') {
    deudaAbierta = d;
    const f = $('deuda-form');
    f.sentido.value = d ? d.sentido : sentido;
    f.persona.value = d ? d.persona : '';
    f.monto.value = d ? (d.monto / 100).toFixed(2) : '';
    f.nota.value = d ? d.nota || '' : '';
    f.abono.value = '';
    $('deuda-titulo').textContent = d ? 'Deuda o préstamo' : 'Anotar deuda o préstamo';
    $('deuda-borrar').hidden = !d;
    pintarPagos();
    $('editor-deuda').showModal();
  }

  function pintarPagos() {
    const d = deudaAbierta;
    $('deuda-pagos').hidden = !d;
    if (!d) return;
    const s = saldo(d);
    $('deuda-saldo').textContent = s > 0
      ? `${d.sentido === 'medeben' ? 'Te falta cobrar' : 'Te falta pagar'} ${dinero(s)} de ${dinero(d.monto)}.`
      : '¡Pagada completa! ✓';
    $('deuda-abonos').innerHTML = (d.abonos || []).map(a => `<li><span>${fechaCorta(a.fecha)}</span><strong>${dinero(a.monto)}</strong></li>`).join('');
    $('deuda-abonar-fila').hidden = s <= 0;
  }

  async function guardarDeuda() {
    const f = $('deuda-form');
    const monto = aCentavos(f.monto.value);
    if (!monto) { f.monto.setCustomValidity('Escribe el monto, por ejemplo 50'); f.monto.reportValidity(); return null; }
    const d = {
      ...(deudaAbierta || { id: nuevoId(), abonos: [], fecha: fechaLocal(), negocio: estado.espacio }),
      sentido: f.sentido.value === 'debo' ? 'debo' : 'medeben',
      persona: f.persona.value.trim().slice(0, 40),
      monto,
      nota: f.nota.value.trim().slice(0, 100),
    };
    await DB.guardarDeuda(d);
    return d;
  }

  async function abonar() {
    const f = $('deuda-form');
    const monto = aCentavos(f.abono.value);
    if (!monto) { f.abono.setCustomValidity('Escribe cuánto pagó, por ejemplo 20'); f.abono.reportValidity(); return; }
    const d = deudaAbierta;
    d.abonos = [...(d.abonos || []), { fecha: fechaLocal(), monto }];
    await DB.guardarDeuda(d);
    f.abono.value = '';
    pintarPagos();
    repintar();
    vibrar(30);
    avisar(saldo(d) <= 0 ? `¡Listo! La deuda con ${d.persona} quedó pagada.` : `Pago anotado: ${dinero(monto)}. Falta ${dinero(saldo(d))}.`);
  }

  // Lo que la IA entendió de una deuda: { persona, sentido: 'me_deben' | 'debo', accion: 'nueva' | 'pago', monto, seguro }.
  // Devuelve { texto, deshacer } o null si no se pudo anotar (la frase queda para revisar).
  async function deudaDeVoz(x, esp, fecha) {
    const monto = Math.round(Number(x.monto) * 100) || 0;
    const persona = String(x.persona || '').trim().slice(0, 40);
    const sentido = x.sentido === 'debo' ? 'debo' : 'medeben';
    if (!x.seguro || !monto || !persona) return null;
    if (x.accion === 'pago') {
      const d = (await deudasDe(esp)).filter(k => k.sentido === sentido && saldo(k) > 0 && normal(k.persona) === normal(persona))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      if (!d) return null;
      const antes = d.abonos || [];
      d.abonos = [...antes, { fecha, monto }];
      await DB.guardarDeuda(d);
      return {
        texto: `Pago anotado: ${dinero(monto)} ${sentido === 'medeben' ? 'de' : 'a'} ${d.persona}${saldo(d) > 0 ? `, falta ${dinero(saldo(d))}` : ', ¡pagada!'}`,
        deshacer: () => DB.guardarDeuda({ ...d, abonos: antes }),
      };
    }
    const d = { id: nuevoId(), sentido, persona, monto, abonos: [], fecha, nota: '', negocio: esp };
    await DB.guardarDeuda(d);
    return {
      texto: sentido === 'medeben' ? `Anotado: ${persona} te debe ${dinero(monto)}` : `Anotado: le debes ${dinero(monto)} a ${persona}`,
      deshacer: () => DB.borrarDeuda(d.id),
    };
  }

  // Para la IA: con quién hay deudas abiertas, así sabe que "Juan me pagó 20" es un pago.
  async function abiertasParaIA(esp) {
    return (await deudasDe(esp)).filter(d => saldo(d) > 0)
      .map(d => `${d.persona}: ${d.sentido === 'medeben' ? 'le debe a la persona' : 'la persona le debe'} ${(saldo(d) / 100).toFixed(2)}`);
  }

  // ---------- Fijos del mes ----------
  // Un concepto con `fijo` (día del mes) se anota solo ese día por su presupuesto del mes.
  // `fijoHecho` guarda el último mes anotado: si borras el movimiento, no se vuelve a anotar.
  const diaFijo = (c, f = new Date()) => Math.min(c.fijo, new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate());
  const cuando = n => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

  function pintarFijos() {
    const hoy = new Date(), mes = mesDe(hoy);
    const fijos = conceptosDe().filter(c => c.fijo).sort((a, b) => diaFijo(a) - diaFijo(b));
    const nom = nombres();
    const filas = fijos.map(c => {
      const falta = diaFijo(c) - hoy.getDate();
      const estadoTxt = c.fijoHecho === mes ? 'anotado ✓' : !presupuestoEn(c, mes) ? 'sin monto' : falta >= 0 ? cuando(falta) : 'empieza el próximo mes';
      return `<li><button type="button" class="mov" data-concepto="${escapar(c.id)}">
        <span class="mov-icono">${escapar(c.icono)}</span>
        <span class="mov-texto"><strong>${escapar(c.nombre)}</strong><small>${nom[c.tipo] || ''} · el día ${c.fijo} de cada mes</small></span>
        <span class="mov-monto">${presupuestoEn(c, mes) ? dinero(presupuestoEn(c, mes)) : '—'}<small>${estadoTxt}</small></span>
      </button></li>`;
    });
    const totalGasto = fijos.filter(c => c.tipo === 'gasto').reduce((s, c) => s + presupuestoEn(c, mes), 0);
    return `<section class="tarjeta herramienta">
      <h2>📅 Fijos del mes</h2>
      ${filas.length ? `<ul class="lista">${filas.join('')}</ul>${totalGasto ? `<p class="nota">Tus gastos fijos suman ${dinero(totalGasto)} al mes.</p>` : ''}`
        : '<p class="nota arriba">¿Pagas o cobras lo mismo cada mes? (arriendo, internet, Netflix, el sueldo). Márcalo como fijo y se anota solo el día que toca.</p>'}
      <button type="button" class="mini-nuevo" id="nuevo-fijo">＋ Fijo del mes</button>
    </section>`;
  }

  let anotando = false;
  async function anotarFijos() {
    if (anotando) return;
    anotando = true;
    try {
      const hoy = new Date(), mes = mesDe(hoy), nuevos = [];
      for (const c of estado.conceptos) {
        if (!c.fijo || c.fijoHecho === mes || hoy.getDate() < diaFijo(c, hoy)) continue;
        const monto = presupuestoEn(c, mes);
        if (!monto) continue;
        const mov = {
          id: nuevoId(), tipo: c.tipo, monto, moneda: 'USD', concepto: c.id,
          fecha: fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), diaFijo(c, hoy), 8, 0, 0)),
          nota: 'Fijo del mes', frase: '', negocio: negocioDe(c), estado: 'listo', ms: null,
          creado: new Date().toISOString(), fijo: mes,
        };
        mov.editado = mov.creado;
        await DB.guardar(mov);
        c.fijoHecho = mes;
        await DB.guardarConcepto(c);
        nuevos.push({ mov, c });
      }
      if (nuevos.length) {
        repintar();
        avisar(`Se anotó solo: ${nuevos.map(({ mov, c }) => `${c.nombre} ${dinero(mov.monto)}`).join(', ')}`, async () => {
          for (const { mov } of nuevos) await DB.borrar(mov.id);
        });
        return;
      }
      // Aviso de los que vienen en 1 o 2 días (una vez al día).
      const proximos = estado.conceptos.filter(c => c.fijo && c.fijoHecho !== mes && presupuestoEn(c, mes)
        && [1, 2].includes(diaFijo(c, hoy) - hoy.getDate()));
      const dia = fechaLocal().slice(0, 10);
      let visto = '';
      try { visto = localStorage.getItem('fijos-aviso') || ''; } catch { /* sin almacenamiento */ }
      if (proximos.length && visto !== dia) {
        try { localStorage.setItem('fijos-aviso', dia); } catch { /* sin almacenamiento */ }
        avisar('📅 ' + proximos.map(c => `${cuando(diaFijo(c, hoy) - hoy.getDate()).replace(/^./, l => l.toUpperCase())} se anota ${c.nombre} (${dinero(presupuestoEn(c, mes))})`).join('. '));
      }
    } finally {
      anotando = false;
    }
  }

  // Al guardar un concepto fijo: si su día ya pasó este mes, empieza el próximo (ya lo habrás pagado).
  function prepararFijo(c, previo) {
    if (!c.fijo) { delete c.fijoHecho; return; }
    if (previo && previo.fijo === c.fijo) return;
    const hoy = new Date();
    if (diaFijo(c, hoy) < hoy.getDate()) c.fijoHecho = mesDe(hoy);
    else delete c.fijoHecho;
  }

  // ---------- Pasar plata entre Personal y los negocios ----------
  // Se guardan dos movimientos de tipo 'traspaso', uno en cada espacio (sentido 'sale' y 'entra'),
  // unidos por `par`. No son gasto ni ingreso: solo mueven lo que te queda libre en cada lado.
  let traspasoAbierto = null;
  async function abrirTraspaso(mov) {
    const f = $('traspaso-form');
    const ids = ['', ...estado.negocios.map(n => n.id)];
    const ops = ids.map(id => `<option value="${escapar(id)}">${escapar(nombreEspacio(id))}</option>`).join('');
    f.de.innerHTML = ops;
    f.a.innerHTML = ops;
    traspasoAbierto = null;
    if (mov) {
      const todos = await DB.todos();
      const otro = todos.find(x => x.id === mov.par);
      const sale = mov.sentido === 'sale' ? mov : otro;
      const entra = mov.sentido === 'entra' ? mov : otro;
      traspasoAbierto = { sale, entra };
      f.de.value = sale ? negocioDe(sale) : mov.otro || '';
      f.a.value = entra ? negocioDe(entra) : mov.otro || '';
      f.monto.value = (mov.monto / 100).toFixed(2);
      f.fecha.value = mov.fecha.slice(0, 16);
      f.nota.value = mov.nota || '';
    } else {
      f.de.value = estado.espacio;
      f.a.value = ids.find(id => id !== estado.espacio);
      f.monto.value = aCentavos(estado.entrada) ? (aCentavos(estado.entrada) / 100).toFixed(2) : '';
      f.fecha.value = fechaAnotar().slice(0, 16);
      f.nota.value = '';
    }
    $('traspaso-titulo').textContent = mov ? 'Plata entre espacios' : 'Pasar plata';
    $('traspaso-borrar').hidden = !mov;
    $('editor-traspaso').showModal();
  }

  async function guardarTraspaso() {
    const f = $('traspaso-form');
    const monto = aCentavos(f.monto.value);
    if (!monto) { f.monto.setCustomValidity('Escribe el monto, por ejemplo 100'); f.monto.reportValidity(); return false; }
    if (f.de.value === f.a.value) { f.a.setCustomValidity('Elige otro lugar'); f.a.reportValidity(); return false; }
    const previo = traspasoAbierto || {};
    const comun = {
      tipo: 'traspaso', monto, moneda: 'USD', concepto: '', fecha: f.fecha.value + ':00', nota: f.nota.value.trim().slice(0, 100),
      frase: '', estado: 'listo', ms: null, editado: new Date().toISOString(),
    };
    const creado = new Date().toISOString();
    const idSale = previo.sale ? previo.sale.id : nuevoId(), idEntra = previo.entra ? previo.entra.id : nuevoId();
    const sale = { creado, ...previo.sale, ...comun, id: idSale, sentido: 'sale', negocio: f.de.value, otro: f.a.value, par: idEntra };
    const entra = { creado, ...previo.entra, ...comun, id: idEntra, sentido: 'entra', negocio: f.a.value, otro: f.de.value, par: idSale };
    await DB.guardar(sale);
    await DB.guardar(entra);
    if (!traspasoAbierto) {
      estado.entrada = '';
      estado.inicio = null;
      pintarMonto();
      avisar(`Pasaste ${dinero(monto)} de ${nombreEspacio(sale.negocio)} a ${nombreEspacio(entra.negocio)}`, async () => {
        await DB.borrar(sale.id);
        await DB.borrar(entra.id);
      });
    }
    return true;
  }

  // Un traspaso dicho por voz: { de, a, monto, seguro } con nombres de espacio.
  async function traspasoDeVoz(x, fecha) {
    const ids = ['', ...estado.negocios.map(n => n.id)];
    const id = nombre => ids.find(k => normal(nombreEspacio(k)) === normal(nombre));
    const de = id(x.de), a = id(x.a);
    const monto = Math.round(Number(x.monto) * 100) || 0;
    if (!x.seguro || !monto || de === undefined || a === undefined || de === a) return null;
    const base = { tipo: 'traspaso', monto, moneda: 'USD', concepto: '', fecha, nota: '', frase: '', estado: 'listo', ms: null,
      creado: new Date().toISOString() };
    base.editado = base.creado;
    const sale = { ...base, id: nuevoId(), sentido: 'sale', negocio: de, otro: a };
    const entra = { ...base, id: nuevoId(), sentido: 'entra', negocio: a, otro: de, par: sale.id };
    sale.par = entra.id;
    await DB.guardar(sale);
    await DB.guardar(entra);
    return {
      texto: `Pasaste ${dinero(monto)} de ${nombreEspacio(de)} a ${nombreEspacio(a)}`,
      deshacer: async () => { await DB.borrar(sale.id); await DB.borrar(entra.id); },
    };
  }

  // ---------- Pintar en Proyección ----------
  async function pintar() {
    const [todos, deudas] = await Promise.all([DB.todos(), deudasDe()]);
    $('herramientas').innerHTML = pintarMetas(todos) + pintarDeudas(deudas) + pintarFijos();
  }

  // ---------- Eventos ----------
  $('herramientas').addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('#nueva-meta')) return abrirConcepto(null, { tipo: 'inversion', meta: true });
    if (t.closest('#nuevo-fijo')) return abrirConcepto(null, { tipo: 'gasto', fijo: true });
    if (t.closest('#nueva-deuda')) return abrirDeuda(null);
    const d = t.closest('[data-deuda]');
    if (d) return abrirDeuda((await DB.deudas()).find(x => x.id === d.dataset.deuda));
    const c = t.closest('[data-concepto]');
    if (c) abrirConcepto(concepto(c.dataset.concepto));
  });

  $('deuda-form').addEventListener('input', e => e.target.setCustomValidity && e.target.setCustomValidity(''));
  $('deuda-abonar').addEventListener('click', abonar);
  $('deuda-form').addEventListener('submit', async e => {
    if (!e.submitter || e.submitter.value !== 'guardar') return;
    e.preventDefault();
    if (!$('deuda-form').persona.value.trim()) { $('deuda-form').persona.reportValidity(); return; }
    const nueva = !deudaAbierta;
    const d = await guardarDeuda();
    if (!d) return;
    $('editor-deuda').close();
    repintar();
    if (nueva) avisar(d.sentido === 'medeben' ? `Anotado: ${d.persona} te debe ${dinero(d.monto)}` : `Anotado: le debes ${dinero(d.monto)} a ${d.persona}`,
      async () => { await DB.borrarDeuda(d.id); repintar(); });
  });
  $('deuda-borrar').addEventListener('click', async () => {
    const d = deudaAbierta;
    $('editor-deuda').close();
    await DB.borrarDeuda(d.id);
    repintar();
    avisar(`Borrada la deuda con ${d.persona}`, async () => { await DB.guardarDeuda(d); repintar(); });
  });

  $('traspaso-form').addEventListener('input', e => e.target.setCustomValidity && e.target.setCustomValidity(''));
  $('traspaso-form').addEventListener('change', e => e.target.setCustomValidity && e.target.setCustomValidity(''));
  $('traspaso-form').addEventListener('submit', async e => {
    if (!e.submitter || e.submitter.value !== 'guardar') return;
    e.preventDefault();
    if (await guardarTraspaso()) { $('editor-traspaso').close(); repintar(); }
  });
  $('traspaso-borrar').addEventListener('click', async () => {
    $('editor-traspaso').close();
    const { sale, entra } = traspasoAbierto;
    for (const m of [sale, entra]) if (m) await DB.borrar(m.id);
    repintar();
    const m = sale || entra;
    avisar(`Borrado: ${dinero(m.monto)} entre espacios`, async () => { for (const x of [sale, entra]) if (x) await DB.guardar(x); repintar(); });
  });
  $('anotar-traspaso').addEventListener('click', () => abrirTraspaso(null));

  document.addEventListener('visibilitychange', () => { if (!document.hidden) anotarFijos(); });

  return { pintar, anotarFijos, prepararFijo, abrirTraspaso, deudaDeVoz, traspasoDeVoz, abiertasParaIA, nombreEspacio };
})();
