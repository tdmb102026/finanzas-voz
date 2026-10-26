// Guardado local en el teléfono (IndexedDB). Funciona sin internet.
const DB = (() => {
  const NOMBRE = 'finanzas', VERSION = 3;

  // Conceptos iniciales, tomados del Excel de fer. Presupuesto mensual en centavos.
  const CONCEPTOS_INICIALES = [
    ['sueldo', 'Sueldo mensual', 'ingreso', 'Sueldo', 169000, '💼'],
    ['ganancia', 'Ganancia personal', 'ingreso', 'Negocio', 50000, '🏪'],
    ['ventas', 'Ventas propias', 'ingreso', 'Otros', 10000, '🛒'],
    ['comidas', 'Comidas', 'gasto', 'Gastos', 10000, '🍽️'],
    ['despensa', 'Despensa', 'gasto', 'Gastos', 12000, '🧺'],
    ['gasolina', 'Gasolina', 'gasto', 'Gastos', 10000, '⛽'],
    ['salidas', 'Salidas', 'gasto', 'Gastos', 10000, '🎉'],
    ['medicina', 'Medicina', 'gasto', 'Gastos', 10000, '💊'],
    ['compras', 'Compras', 'gasto', 'Gastos', 5000, '🛍️'],
    ['amazon', 'Amazon', 'gasto', 'Gastos', 10000, '📦'],
    ['luz', 'Luz', 'gasto', 'Servicios', 2000, '💡'],
    ['ahorro', 'Ahorro', 'inversion', 'Ahorro', 0, '🐷'],
    ['juguetes', 'Juguetes', 'inversion', 'Inversiones', 80000, '🧸'],
    ['bienes-raices', 'Bienes raíces', 'inversion', 'Inversiones', 500000, '🏠'],
    ['libros', 'Libros', 'inversion', 'Inversiones', 5000, '📚'],
  ].map(([id, nombre, tipo, categoria, presupuesto, icono], orden) =>
    ({ id, nombre, tipo, categoria, presupuesto, icono, orden, oculto: false, usos: 0 }));

  // Categorías de la fase 1 → concepto equivalente.
  const DE_FASE_1 = {
    comida: 'comidas', transporte: 'gasolina', casa: 'despensa', salud: 'medicina',
    ocio: 'salidas', 'otros-gasto': 'compras', sueldo: 'sueldo', ventas: 'ventas',
    'otros-ingreso': 'ventas',
  };

  // Versión 3: Ahorro e Inversiones dejan de ser gasto y pasan al tipo inversión,
  // junto con los movimientos ya anotados en esos conceptos.
  function aInversion(tx) {
    const conceptos = tx.objectStore('conceptos');
    conceptos.getAll().onsuccess = ev => {
      const ids = new Set();
      for (const c of ev.target.result) {
        if (c.tipo === 'gasto' && /^(ahorro|inversiones)$/i.test(c.categoria.trim())) {
          c.tipo = 'inversion';
          conceptos.put(c);
          ids.add(c.id);
        }
      }
      tx.objectStore('movimientos').openCursor().onsuccess = ev2 => {
        const cur = ev2.target.result;
        if (!cur) return;
        if (ids.has(cur.value.concepto)) cur.update({ ...cur.value, tipo: 'inversion' });
        cur.continue();
      };
    };
  }

  let conexion;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = e => {
        const db = req.result, tx = req.transaction;
        if (e.oldVersion < 1) {
          db.createObjectStore('movimientos', { keyPath: 'id' }).createIndex('fecha', 'fecha');
        }
        if (e.oldVersion < 2) {
          const conceptos = db.createObjectStore('conceptos', { keyPath: 'id' });
          CONCEPTOS_INICIALES.forEach(c => conceptos.put(c));
          tx.objectStore('movimientos').openCursor().onsuccess = ev => {
            const cur = ev.target.result;
            if (!cur) return;
            const m = cur.value;
            if (m.categoria && !m.concepto) {
              m.concepto = DE_FASE_1[m.categoria] || 'compras';
              delete m.categoria;
              cur.update(m);
            }
            cur.continue();
          };
        }
        if (e.oldVersion === 2) aInversion(tx);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return conexion;
  }

  async function operar(tabla, modo, fn) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(tabla, modo);
      const req = fn(tx.objectStore(tabla));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    guardar: mov => operar('movimientos', 'readwrite', t => t.put(mov)),
    borrar: id => operar('movimientos', 'readwrite', t => t.delete(id)),
    // Movimientos con fecha en [desde, hasta), fechas ISO.
    entre: (desde, hasta) => operar('movimientos', 'readonly', t =>
      t.index('fecha').getAll(IDBKeyRange.bound(desde, hasta, false, true))),
    todos: () => operar('movimientos', 'readonly', t => t.getAll()),
    conceptos: () => operar('conceptos', 'readonly', t => t.getAll()),
    guardarConcepto: c => operar('conceptos', 'readwrite', t => t.put(c)),
  };
})();
