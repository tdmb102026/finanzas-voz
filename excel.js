// Crea un archivo .xlsx pequeño, sin librerías: una hoja con números,
// textos y fechas, empaquetada en un zip sin compresión.
const Excel = (() => {
  const texto = new TextEncoder();

  const xml = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  function columna(n) {
    let s = '';
    for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
    return s;
  }

  // { fecha: 'AAAA-MM-DD' } → número de serie de Excel (días desde 1899-12-30).
  function serie(fecha) {
    const [a, m, d] = fecha.split('-').map(Number);
    return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
  }

  function celda(v, ref) {
    if (v && typeof v === 'object' && v.fecha) return `<c r="${ref}" s="1"><v>${serie(v.fecha)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}" s="2"><v>${v}</v></c>`;
    if (v === '' || v == null) return '';
    return `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
  }

  function hoja(filas) {
    const cuerpo = filas.map((fila, i) =>
      `<row r="${i + 1}">${fila.map((v, j) => celda(v, columna(j) + (i + 1))).join('')}</row>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<sheetData>${cuerpo}</sheetData></worksheet>`;
  }

  const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
    + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border/></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
    + '</styleSheet>';

  // hojas: [{ nombre, filas }]
  function archivos(hojas) {
    const mapa = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + hojas.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets>${hojas.map((h, k) => `<sheet name="${xml(h.nombre)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + hojas.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + '</Relationships>',
      'xl/styles.xml': ESTILOS,
    };
    hojas.forEach((h, k) => { mapa[`xl/worksheets/sheet${k + 1}.xml`] = hoja(h.filas); });
    return mapa;
  }

  // ---------- Leer un .xlsx (para Importar respaldo) ----------
  // Sirve con el archivo de la app y también si Excel lo volvió a guardar (comprimido).
  async function descomprimir(datos) {
    const s = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  async function abrirZip(buffer) {
    const v = new DataView(buffer), u = new Uint8Array(buffer), dec = new TextDecoder();
    let fin = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error('No es un archivo de Excel');
    const total = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const mapa = {};
    for (let k = 0; k < total; k++) {
      const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
      const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const nombre = dec.decode(u.subarray(p + 46, p + 46 + nl));
      const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const crudo = u.subarray(ini, ini + tam);
      mapa[nombre] = { metodo, crudo };
      p += 46 + nl + el + cl;
    }
    return async nombre => {
      const e = mapa[nombre];
      if (!e) return null;
      return dec.decode(e.metodo === 8 ? await descomprimir(e.crudo) : e.crudo);
    };
  }

  // Columna A de la hoja con ese nombre, fila por fila (texto).
  async function leerColumna(buffer, nombreHoja) {
    const leer = await abrirZip(buffer);
    const dom = t => new DOMParser().parseFromString(t, 'application/xml');
    const libro = dom(await leer('xl/workbook.xml'));
    const hojaEl = [...libro.getElementsByTagName('sheet')].find(h => h.getAttribute('name') === nombreHoja);
    if (!hojaEl) return null;
    const rid = hojaEl.getAttribute('r:id') || hojaEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rels = dom(await leer('xl/_rels/workbook.xml.rels'));
    const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
    const destino = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, '');
    const hojaXml = dom(await leer('xl/' + destino));
    const compartidos = await leer('xl/sharedStrings.xml');
    const tabla = compartidos ? [...dom(compartidos).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const col = [];
    for (const c of hojaXml.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || '';
      if (!/^A\d+$/.test(ref)) continue;
      const t = c.getAttribute('t');
      let val = '';
      if (t === 's') val = tabla[Number(c.getElementsByTagName('v')[0]?.textContent)] || '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else val = c.getElementsByTagName('v')[0]?.textContent || '';
      col[Number(ref.slice(1)) - 1] = val;
    }
    return col;
  }

  // ---------- Zip sin compresión ----------

  const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(mapa) {
    const partes = [], central = [];
    let offset = 0;
    for (const [nombre, contenido] of Object.entries(mapa)) {
      const n = texto.encode(nombre), datos = texto.encode(contenido), crc = crc32(datos);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nombres en UTF-8
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, n.length, true);
      partes.push(local, n, datos);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, datos.length, true);
      cen.setUint32(24, datos.length, true);
      cen.setUint16(28, n.length, true);
      cen.setUint32(42, offset, true);
      central.push(cen, n);
      offset += 30 + n.length + datos.length;
    }
    const tamCentral = central.reduce((s, p) => s + p.byteLength, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, central.length / 2, true);
    fin.setUint16(10, central.length / 2, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);
    return new Blob([...partes, ...central, fin],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  return {
    // filas: arreglo de arreglos; cada valor es texto, número o { fecha: 'AAAA-MM-DD' }.
    libro: (nombreHoja, filas) => zip(archivos([{ nombre: nombreHoja, filas }])),
    libroVarias: hojas => zip(archivos(hojas)),
    leerColumna,
  };
})();
