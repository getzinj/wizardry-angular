import { SAVE_DISK_STORE, runTransaction } from './local-database';
import type { ISaveDisk, ISaveDiskStore } from './save-disks';

/** Save disks kept in the browser's own database. */
export class BrowserSaveDiskStore implements ISaveDiskStore {

  public async list(): Promise<ISaveDisk[]> {
    try {
      return await runTransaction<ISaveDisk[]>(SAVE_DISK_STORE, 'readonly',
        (store: IDBObjectStore): IDBRequest<ISaveDisk[]> => store.getAll());
    } catch {
      return [];
    }
  }


  public async read(id: string): Promise<ISaveDisk | null> {
    try {
      return await runTransaction<ISaveDisk | undefined>(SAVE_DISK_STORE, 'readonly',
        (store: IDBObjectStore): IDBRequest<ISaveDisk | undefined> => store.get(id)) ?? null;
    } catch {
      return null;
    }
  }


  public async put(disk: ISaveDisk): Promise<void> {
    await runTransaction<IDBValidKey>(SAVE_DISK_STORE, 'readwrite',
      (store: IDBObjectStore): IDBRequest<IDBValidKey> => store.put(disk, disk.id));
  }


  public async remove(id: string): Promise<void> {
    await runTransaction<undefined>(SAVE_DISK_STORE, 'readwrite',
      (store: IDBObjectStore): IDBRequest<undefined> => store.delete(id));
  }

}
