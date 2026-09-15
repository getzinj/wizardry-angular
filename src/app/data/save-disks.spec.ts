import { beforeEach, describe, expect, it } from 'vitest';

import type { ISaveDisk, NewDiskResult } from './save-disks';
import { InMemorySaveDiskStore, SaveDiskLibrary } from './save-disks';

const MASTER: Uint8Array = new Uint8Array([1, 2, 3, 4]);
const MESSAGES: Uint8Array = new Uint8Array([5, 6]);
const GAME: string = 'A TEST SCENARIO';
const LIMIT: number = 3;

let library: SaveDiskLibrary;


async function makeDisk(name: string): Promise<ISaveDisk> {
  const result: NewDiskResult = await library.createFromScenario(MASTER, MESSAGES, GAME, name);

  if (result.ok) {
    return result.disk;
  } else {
    throw new Error(result.message);
  }
}


beforeEach((): void => {
  library = new SaveDiskLibrary(new InMemorySaveDiskStore(), LIMIT);
});


describe('making a save disk', (): void => {
  it('starts with none', async (): Promise<void> => {
    expect(await library.list()).toEqual([]);
  });

  it('copies the master', async (): Promise<void> => {
    const disk: ISaveDisk = await makeDisk('DISK 1');

    expect([...disk.scenarioData]).toEqual([...MASTER]);
  });

  it('copies rather than shares, so playing one disk cannot alter another', async (): Promise<void> => {
    const disk: ISaveDisk = await makeDisk('DISK 1');

    disk.scenarioData[0] = 99;

    expect(MASTER[0]).toBe(1);
  });

  it('remembers which scenario it holds', async (): Promise<void> => {
    expect((await makeDisk('DISK 1')).gameName).toBe(GAME);
  });

  it('gives each disk its own identity', async (): Promise<void> => {
    const first: ISaveDisk = await makeDisk('DISK 1');
    const second: ISaveDisk = await makeDisk('DISK 2');

    expect(first.id).not.toBe(second.id);
  });

  it('falls back to a suggested name when given none', async (): Promise<void> => {
    expect((await makeDisk('  ')).name).toBe('DISK 1');
  });

  it('suggests a name that is not already taken', async (): Promise<void> => {
    await makeDisk('DISK 1');

    expect(await library.suggestName()).toBe('DISK 2');
  });
});


describe('the limit on how many disks are kept', (): void => {
  it('allows disks up to the limit', async (): Promise<void> => {
    await makeDisk('DISK 1');
    await makeDisk('DISK 2');
    await makeDisk('DISK 3');

    expect((await library.list()).length).toBe(LIMIT);
  });

  it('refuses one beyond it', async (): Promise<void> => {
    await makeDisk('DISK 1');
    await makeDisk('DISK 2');
    await makeDisk('DISK 3');

    expect((await library.createFromScenario(MASTER, MESSAGES, GAME, 'DISK 4')).ok).toBe(false);
  });

  it('says how many are allowed when it refuses', async (): Promise<void> => {
    await makeDisk('DISK 1');
    await makeDisk('DISK 2');
    await makeDisk('DISK 3');

    const result: NewDiskResult = await library.createFromScenario(MASTER, MESSAGES, GAME, 'DISK 4');

    expect(!result.ok && result.message).toContain(String(LIMIT));
  });

  it('reports being full', async (): Promise<void> => {
    await makeDisk('DISK 1');
    await makeDisk('DISK 2');
    await makeDisk('DISK 3');

    expect(await library.isFull()).toBe(true);
  });

  it('makes room again once one is deleted', async (): Promise<void> => {
    const first: ISaveDisk = await makeDisk('DISK 1');

    await makeDisk('DISK 2');
    await makeDisk('DISK 3');
    await library.remove(first.id);

    expect(await library.isFull()).toBe(false);
  });
});


describe('playing a disk', (): void => {
  it('writes back what changed', async (): Promise<void> => {
    const disk: ISaveDisk = await makeDisk('DISK 1');

    await library.save(disk, new Uint8Array([9, 9, 9, 9]));

    expect([...(await library.read(disk.id))!.scenarioData]).toEqual([9, 9, 9, 9]);
  });

  it('leaves other disks alone', async (): Promise<void> => {
    const first: ISaveDisk = await makeDisk('DISK 1');
    const second: ISaveDisk = await makeDisk('DISK 2');

    await library.save(first, new Uint8Array([9, 9, 9, 9]));

    expect([...(await library.read(second.id))!.scenarioData]).toEqual([...MASTER]);
  });

  it('lists the most recently played first', async (): Promise<void> => {
    const first: ISaveDisk = await makeDisk('DISK 1');

    await makeDisk('DISK 2');
    await library.save(first, MASTER);

    expect((await library.list())[0].name).toBe('DISK 1');
  });
});


describe('tending the shelf', (): void => {
  it('renames a disk', async (): Promise<void> => {
    const disk: ISaveDisk = await makeDisk('DISK 1');

    await library.rename(disk.id, 'TREBOR');

    expect((await library.read(disk.id))!.name).toBe('TREBOR');
  });

  it('refuses to rename a disk to nothing', async (): Promise<void> => {
    const disk: ISaveDisk = await makeDisk('DISK 1');

    await library.rename(disk.id, '   ');

    expect((await library.read(disk.id))!.name).toBe('DISK 1');
  });

  it('deletes a disk', async (): Promise<void> => {
    const disk: ISaveDisk = await makeDisk('DISK 1');

    await library.remove(disk.id);

    expect(await library.read(disk.id)).toBeNull();
  });
});
