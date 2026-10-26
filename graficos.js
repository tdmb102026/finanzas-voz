// Gráficos del Resumen en SVG, sin librerías. Cada función devuelve el HTML del
// gráfico; Graficos.activar(contenedor) conecta el toque/hover después de pintarlo.
const Graficos = (() => {
  const corto = c => {
    const d = c / 100;
    if (Math.abs(d) >= 1000) return `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k`;
    return `$${Math.round(d)}`;
  };

  // Escala con marcas redondas (0, 250, 500…) que cubre el máximo.
  function escala(maximo) {
    const crudo = Math.max(maximo, 100) / 3;
    const pot = 10 ** Math.floor(Math.log10(crudo));
    const paso = [1, 2, 2.5, 5, 10].map(k => k * pot).find(p => p >= crudo);
    const tope = Math.ceil(maximo / paso) * paso || paso;
    const marcas = [];
    for (let v = 0; v < tope + paso / 2; v += paso) marcas.push(v);
    return { max: tope, marcas };
  }

  // ---------- Dona ----------

  // Sector de anillo entre dos ángulos (radianes, 0 = arriba, sentido horario).
  function sector(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    return `M${p(r1, a0)}A${r1} ${r1} 0 ${grande} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${grande} 0 ${p(r0, a0)}Z`;
  }

  // partes: [{ nombre, valor, color }]; centro: { titulo, valor } por defecto.
  function dona(partes, centro) {
    const total = partes.reduce((s, p) => s + p.valor, 0);
    if (!total) return '';
    const cx = 90, cy = 90, r1 = 84, r0 = 58, hueco = partes.length > 1 ? 0.03 : 0;
    let a = 0;
    const sectores = partes.map((p, i) => {
      const da = p.valor / total * Math.PI * 2;
      const d = da >= Math.PI * 2 - 1e-6
        ? `M${cx} ${cy - r1}A${r1} ${r1} 0 1 1 ${cx - 0.01} ${cy - r1}ZM${cx} ${cy - r0}A${r0} ${r0} 0 1 0 ${cx + 0.01} ${cy - r0}Z`
        : sector(cx, cy, r0, r1, a + hueco / 2, a + Math.max(da - hueco / 2, hueco / 2 + 0.001));
      a += da;
      return `<path d="${d}" style="fill:${p.color}" fill-rule="evenodd" class="marca" tabindex="0" data-i="${i}"></path>`;
    }).join('');
    const datos = encodeURIComponent(JSON.stringify(partes.map(p => ({
      nombre: p.nombre, valor: dinero(p.valor), pct: Math.round(p.valor / total * 100) }))));
    return `<div class="grafico dona" data-tipo="dona" data-partes="${datos}"
        data-titulo="${escapar(centro.titulo)}" data-valor="${escapar(centro.valor)}">
      <svg viewBox="0 0 180 180" role="img" aria-label="${escapar(centro.titulo)}">
        ${sectores}
        <text x="90" y="84" text-anchor="middle" class="dona-titulo"></text>
        <text x="90" y="106" text-anchor="middle" class="dona-valor"></text>
      </svg>
      <ul class="leyenda-tabla">${partes.map(p => `
        <li><i style="background:${p.color}"></i><span>${escapar(p.nombre)}</span>
        <strong>${dinero(p.valor)}</strong><small>${Math.round(p.valor / total * 100)}%</small></li>`).join('')}
      </ul>
    </div>`;
  }

  // ---------- Curva acumulada del mes ----------

  // dias: [{ dia, acumulado }] hasta hoy o fin de mes; ppto: presupuesto del mes;
  // totalDias: días del mes. Línea punteada = ritmo parejo del presupuesto.
  function curva(dias, ppto, totalDias, color) {
    if (!dias.length) return '';
    const W = 340, H = 190, izq = 40, der = 12, arr = 12, aba = 26;
    const esc = escala(Math.max(ppto, ...dias.map(d => d.acumulado), 1)), max = esc.max;
    const X = d => izq + (d - 1) / Math.max(totalDias - 1, 1) * (W - izq - der);
    const Y = v => arr + (1 - v / max) * (H - arr - aba);
    const linea = dias.map((d, i) => `${i ? 'L' : 'M'}${X(d.dia).toFixed(1)} ${Y(d.acumulado).toFixed(1)}`).join('');
    const area = `${linea}L${X(dias.at(-1).dia).toFixed(1)} ${Y(0)}L${X(1)} ${Y(0)}Z`;
    const rejilla = esc.marcas.map(v => `<line x1="${izq}" x2="${W - der}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="rejilla"/>
      <text x="${izq - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="eje">${corto(v)}</text>`).join('');
    const etiquetasX = [1, 10, 20, totalDias].map(d =>
      `<text x="${X(d).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="eje">${d}</text>`).join('');
    const ritmo = ppto ? `<line x1="${X(1)}" y1="${Y(0)}" x2="${X(totalDias)}" y2="${Y(ppto).toFixed(1)}" class="ritmo"/>
      <text x="${X(totalDias) - 2}" y="${(Y(ppto) - 6).toFixed(1)}" text-anchor="end" class="eje">Ppto ${corto(ppto)}</text>` : '';
    const ultimo = dias.at(-1);
    const datos = encodeURIComponent(JSON.stringify({ dias, ppto, totalDias, W, izq, der, arr, aba, H, max }));
    return `<div class="grafico curva" data-tipo="curva" data-datos="${datos}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos acumulados del mes contra el presupuesto">
        ${rejilla}${etiquetasX}
        <line x1="${izq}" x2="${W - der}" y1="${Y(0)}" y2="${Y(0)}" class="base"/>
        ${ritmo}
        <path d="${area}" style="fill:${color}" fill-opacity="0.14"/>
        <path d="${linea}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${X(ultimo.dia).toFixed(1)}" cy="${Y(ultimo.acumulado).toFixed(1)}" r="4" style="fill:${color}" class="anillo"/>
        <g class="cursor" visibility="hidden">
          <line y1="${arr}" y2="${Y(0)}" class="cruz"/>
          <circle r="4" style="fill:${color}" class="anillo"/>
        </g>
        <rect x="${izq}" y="0" width="${W - izq - der}" height="${H}" fill="transparent" class="zona"/>
      </svg>
      <div class="globo" hidden></div>
    </div>`;
  }

  // ---------- Barras agrupadas por mes ----------

  // meses: [{ nombre, valores: [n, n, n] }]; series: [{ nombre, color }].
  function barras(meses, series) {
    const W = 340, H = 190, izq = 40, der = 8, arr = 12, aba = 26;
    const esc = escala(Math.max(1, ...meses.flatMap(m => m.valores))), max = esc.max;
    const Y = v => arr + (1 - v / max) * (H - arr - aba);
    const ancho = (W - izq - der) / meses.length;
    const bw = Math.min(12, (ancho - 14) / series.length - 2);
    const rejilla = esc.marcas.map(v => `<line x1="${izq}" x2="${W - der}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="rejilla"/>
      <text x="${izq - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="eje">${corto(v)}</text>`).join('');
    // Barra con las esquinas de arriba redondeadas y la base recta sobre el eje.
    const barra = (x, v, color) => {
      const y0 = Y(0), y = Y(v), h = y0 - y;
      if (h <= 0.5) return '';
      const r = Math.min(4, bw / 2, h);
      return `<path d="M${x} ${y0}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${y0}Z" style="fill:${color}"/>`;
    };
    const grupos = meses.map((m, i) => {
      const x0 = izq + i * ancho + (ancho - series.length * (bw + 2) + 2) / 2;
      const datos = encodeURIComponent(JSON.stringify({ mes: m.nombre,
        filas: series.map((s, j) => ({ nombre: s.nombre, color: s.color, valor: dinero(m.valores[j]) })) }));
      return `<g class="grupo" tabindex="0" data-datos="${datos}">
        <rect x="${izq + i * ancho}" y="${arr}" width="${ancho}" height="${H - arr - aba}" class="zona-grupo"/>
        ${m.valores.map((v, j) => barra(x0 + j * (bw + 2), v, series[j].color)).join('')}
        <text x="${(izq + i * ancho + ancho / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="eje">${escapar(m.nombre)}</text>
      </g>`;
    }).join('');
    return `<div class="grafico barras" data-tipo="barras">
      <ul class="leyenda">${series.map(s => `<li><i style="background:${s.color}"></i>${escapar(s.nombre)}</li>`).join('')}</ul>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos, gastos e inversión de los últimos meses">
        ${rejilla}<line x1="${izq}" x2="${W - der}" y1="${Y(0)}" y2="${Y(0)}" class="base"/>${grupos}
      </svg>
      <div class="globo" hidden></div>
    </div>`;
  }

  // ---------- Interacción ----------

  function globo(cont, titulo, filas, xPct) {
    const g = cont.querySelector('.globo');
    g.replaceChildren();
    const t = document.createElement('div');
    t.className = 'globo-titulo';
    t.textContent = titulo;
    g.append(t);
    for (const f of filas) {
      const fila = document.createElement('div');
      fila.className = 'globo-fila';
      const clave = document.createElement('i');
      clave.style.background = f.color;
      const v = document.createElement('strong');
      v.textContent = f.valor;
      const n = document.createElement('span');
      n.textContent = f.nombre;
      fila.append(clave, v, n);
      g.append(fila);
    }
    g.hidden = false;
    const ancho = cont.clientWidth, w = g.offsetWidth;
    g.style.left = `${Math.min(Math.max(xPct / 100 * ancho - w / 2, 0), ancho - w)}px`;
  }

  function activarDona(cont) {
    const partes = JSON.parse(decodeURIComponent(cont.dataset.partes));
    const [tt, tv] = cont.querySelectorAll('text');
    const poner = (t, v) => { tt.textContent = t; tv.textContent = v; };
    const reposo = () => {
      poner(cont.dataset.titulo, cont.dataset.valor);
      cont.querySelectorAll('.marca').forEach(m => m.classList.remove('activa', 'apagada'));
    };
    reposo();
    cont.querySelectorAll('.marca').forEach(m => {
      const mostrar = () => {
        const p = partes[m.dataset.i];
        poner(`${p.nombre} · ${p.pct}%`, p.valor);
        cont.querySelectorAll('.marca').forEach(o => {
          o.classList.toggle('activa', o === m);
          o.classList.toggle('apagada', o !== m);
        });
      };
      m.addEventListener('pointerenter', mostrar);
      m.addEventListener('focus', mostrar);
      m.addEventListener('click', mostrar);
    });
    cont.querySelector('svg').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') reposo(); });
    cont.querySelectorAll('.marca').forEach(m => m.addEventListener('blur', reposo));
  }

  function activarCurva(cont) {
    const d = JSON.parse(decodeURIComponent(cont.dataset.datos));
    const svg = cont.querySelector('svg'), cursor = cont.querySelector('.cursor');
    const X = dia => d.izq + (dia - 1) / Math.max(d.totalDias - 1, 1) * (d.W - d.izq - d.der);
    const Y = v => d.arr + (1 - v / d.max) * (d.H - d.arr - d.aba);
    const mover = e => {
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * d.W;
      const dia = Math.round(1 + (x - d.izq) / (d.W - d.izq - d.der) * (d.totalDias - 1));
      const p = d.dias.reduce((a, b) => Math.abs(b.dia - dia) < Math.abs(a.dia - dia) ? b : a);
      cursor.setAttribute('visibility', 'visible');
      cursor.querySelector('line').setAttribute('x1', X(p.dia));
      cursor.querySelector('line').setAttribute('x2', X(p.dia));
      cursor.querySelector('circle').setAttribute('cx', X(p.dia));
      cursor.querySelector('circle').setAttribute('cy', Y(p.acumulado));
      const filas = [{ nombre: 'gastado', valor: dinero(p.acumulado), color: 'var(--c-gasto)' }];
      if (d.ppto) filas.push({ nombre: 'presupuesto a la fecha', valor: dinero(Math.round(d.ppto * p.dia / d.totalDias)), color: 'var(--suave)' });
      globo(cont, `Día ${p.dia}`, filas, X(p.dia) / d.W * 100);
    };
    const salir = () => { cursor.setAttribute('visibility', 'hidden'); cont.querySelector('.globo').hidden = true; };
    const zona = cont.querySelector('.zona');
    zona.addEventListener('pointermove', mover);
    zona.addEventListener('pointerdown', mover);
    zona.addEventListener('pointerleave', salir);
  }

  function activarBarras(cont) {
    const grupos = cont.querySelectorAll('.grupo');
    grupos.forEach(g => {
      const mostrar = () => {
        const d = JSON.parse(decodeURIComponent(g.dataset.datos));
        grupos.forEach(o => o.classList.toggle('activa', o === g));
        const r = g.querySelector('.zona-grupo');
        const x = (Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2) / 340 * 100;
        globo(cont, d.mes, d.filas, x);
      };
      g.addEventListener('pointerenter', mostrar);
      g.addEventListener('focus', mostrar);
      g.addEventListener('click', mostrar);
    });
    cont.querySelector('svg').addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      grupos.forEach(o => o.classList.remove('activa'));
      cont.querySelector('.globo').hidden = true;
    });
  }

  function activar(raiz) {
    raiz.querySelectorAll('.grafico').forEach(c => {
      if (c.dataset.tipo === 'dona') activarDona(c);
      if (c.dataset.tipo === 'curva') activarCurva(c);
      if (c.dataset.tipo === 'barras') activarBarras(c);
    });
  }

  return { dona, curva, barras, activar };
})();
