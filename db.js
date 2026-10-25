// Guardado local en el teléfono (IndexedDB). Funciona sin internet.
const DB = (() => {
  const NOMBRE = 'finanzas', VERSION = 1, TABLA = 'movimientos';
  let conexion;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const tabla = req.result.createObjectStore(TABLA, { keyPath: 'id' });
        tabla.createIndex('fecha', 'fecha');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return conexion;
  }

  async function operar(modo, fn) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLA, modo);
      const req = fn(tx.objectStore(TABLA));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    guardar: mov => operar('readwrite', t => t.put(mov)),
    borrar: id => operar('readwrite', t => t.delete(id)),
    // Movimientos con fecha en [desde, hasta), fechas ISO.
    entre: (desde, hasta) => operar('readonly', t =>
      t.index('fecha').getAll(IDBKeyRange.bound(desde, hasta, false, true))),
  };
})();
