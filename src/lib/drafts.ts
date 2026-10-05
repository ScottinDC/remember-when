type Draft = { key: string; blob: Blob; seconds: number; savedAt: number };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("remember-when-drafts", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = action(tx.objectStore("drafts"));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const readDraft = (key: string) =>
  access<Draft | undefined>("readonly", (store) => store.get(key));
export const saveDraft = (key: string, blob: Blob, seconds: number) =>
  access("readwrite", (store) =>
    store.put({ key, blob, seconds, savedAt: Date.now() }),
  );
export const deleteDraft = (key: string) =>
  access("readwrite", (store) => store.delete(key));

// Preserve call order even while IndexedDB is opening (save followed by discard).
let pending: Promise<unknown> = Promise.resolve();
function access<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const next = pending.then(() => transact(mode, action));
  pending = next.catch(() => undefined);
  return next;
}
