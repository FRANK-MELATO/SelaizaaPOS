/**
 * IndexedDB wrapper for offline POS mode
 */

const DB_NAME = 'atchaar-pos-offline';
const DB_VERSION = 1;
const CART_STORE = 'cart';
const SALES_STORE = 'offline-sales';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(CART_STORE)) {
        database.createObjectStore(CART_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(SALES_STORE)) {
        const store = database.createObjectStore(SALES_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(database => {
    const transaction = database.transaction([storeName], mode);
    return transaction.objectStore(storeName);
  });
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save cart state offline
 */
export async function saveCartOffline(cart) {
  try {
    const store = await tx(CART_STORE, 'readwrite');
    await promisify(store.put({ id: 'current-cart', ...cart, savedAt: new Date().toISOString() }));
  } catch (err) {
    console.warn('Failed to save cart offline:', err);
  }
}

/**
 * Retrieve offline cart
 */
export async function getOfflineCart() {
  try {
    const store = await tx(CART_STORE);
    return await promisify(store.get('current-cart'));
  } catch {
    return null;
  }
}

/**
 * Clear offline cart
 */
export async function clearOfflineCart() {
  try {
    const store = await tx(CART_STORE, 'readwrite');
    await promisify(store.delete('current-cart'));
  } catch (err) {
    console.warn('Failed to clear offline cart:', err);
  }
}

/**
 * Queue a sale for later sync
 */
export async function saveOfflineSale(sale) {
  try {
    const store = await tx(SALES_STORE, 'readwrite');
    const id = await promisify(store.add({
      ...sale,
      synced: false,
      queuedAt: new Date().toISOString()
    }));
    return id;
  } catch (err) {
    console.warn('Failed to queue offline sale:', err);
    return null;
  }
}

/**
 * Get all pending offline sales
 */
export async function getOfflineSales() {
  try {
    const store = await tx(SALES_STORE);
    const all = await promisify(store.getAll());
    return all.filter(s => !s.synced);
  } catch {
    return [];
  }
}

/**
 * Remove an offline sale (after successful sync)
 */
export async function removeOfflineSale(id) {
  try {
    const store = await tx(SALES_STORE, 'readwrite');
    await promisify(store.delete(id));
  } catch (err) {
    console.warn('Failed to remove offline sale:', err);
  }
}

/**
 * Attempt to sync all queued offline sales
 * @param {Function} onSync - called with each successfully synced sale
 */
export async function syncOfflineSales(onSync) {
  const { salesService } = await import('../services/api');
  const pending = await getOfflineSales();
  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    try {
      const { id, synced: _s, queuedAt: _q, ...saleData } = sale;
      await salesService.createSale(saleData);
      await removeOfflineSale(id);
      synced++;
      if (onSync) onSync(sale);
    } catch {
      failed++;
    }
  }

  return { synced, failed, total: pending.length };
}
