// The browser database everything the player owns is kept in: the scenario they imported, and
// their save disks. Nothing here is sent anywhere.

const DATABASE_NAME: string = 'wizardry';

/** Raised when a store is added. Version 1 held only the imported scenario. */
const DATABASE_VERSION: number = 2;

export const SCENARIO_STORE: string = 'scenario';
export const SAVE_DISK_STORE: string = 'disks';


function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject): void => {
    const request: IDBOpenDBRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (): void => {
      for (const store of [ SCENARIO_STORE, SAVE_DISK_STORE ]) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store);
        }
      }
    };

    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error ?? new Error('could not open local storage'));
  });
}


export function runTransaction<T>(store: string,
                                  mode: IDBTransactionMode,
                                  action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database: IDBDatabase): Promise<T> =>
    new Promise<T>((resolve, reject): void => {
      const request: IDBRequest<T> = action(database.transaction(store, mode).objectStore(store));

      request.onsuccess = (): void => {
        resolve(request.result);
        database.close();
      };

      request.onerror = (): void => {
        reject(request.error ?? new Error('local storage failed'));
        database.close();
      };
    }));
}


/**
 * Asks the browser not to throw this data away when it is short of room. Browsers may evict an
 * ordinary site's storage without warning, which here would mean losing characters. Refusal is not
 * worth reporting: there is nothing the player can do about it and the game still works.
 */
export async function requestDurableStorage(): Promise<boolean> {
  try {
    return await navigator.storage?.persist?.() ?? false;
  } catch {
    return false;
  }
}
