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

  function archivos(nombreHoja, filas) {
    return {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets><sheet name="${xml(nombreHoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>',
      'xl/styles.xml': ESTILOS,
      'xl/worksheets/sheet1.xml': hoja(filas),
    };
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
    libro: (nombreHoja, filas) => zip(archivos(nombreHoja, filas)),
  };
})();
