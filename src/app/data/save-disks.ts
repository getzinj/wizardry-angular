// Save disks.
//
// The original had no save files. Your characters lived on the scenario disk itself, which the
// game wrote to as you played: the roster, the shop's stock and the special squares you had used
// up were all changes to that floppy. Players kept a master disk untouched and played on copies,
// and the game's own utilities existed to make those copies. This follows the same shape, so
// saving needs no separate format and no decisions about what is worth keeping: a save disk is a
// disk.
//
// Copies are whole. A scenario is around sixty kilobytes, so a shelf of them is still smaller than
// one photograph, and storing them whole avoids having to reason about which parts the game
// touches.

/** How many a player may keep. Whole copies, so this bounds the room they take. */
export const MAXIMUM_SAVE_DISKS: number = 6;


export interface ISaveDiskSummary {
  readonly id: string;

  /** What the player calls it. */
  readonly name: string;

  /** The scenario it holds, read from the disk itself, so a disk stands on its own. */
  readonly gameName: string;

  readonly createdAt: number;
  readonly playedAt: number;
}


export interface ISaveDisk extends ISaveDiskSummary {
  readonly scenarioData: Uint8Array;

  /**
   * The scenario's messages, copied along with it. The game only ever reads these, so they never
   * change, but carrying them keeps a save disk self-contained: it can be exported, taken to
   * another machine and played there without the master it was copied from.
   */
  readonly scenarioMessages: Uint8Array | null;
}


/** Somewhere to keep save disks. The game uses the browser's; tests use one held in memory. */
export interface ISaveDiskStore {
  list(): Promise<ISaveDisk[]>;
  read(id: string): Promise<ISaveDisk | null>;
  put(disk: ISaveDisk): Promise<void>;
  remove(id: string): Promise<void>;
}


export class InMemorySaveDiskStore implements ISaveDiskStore {
  private readonly disks: Map<string, ISaveDisk> = new Map<string, ISaveDisk>();

  public list(): Promise<ISaveDisk[]> {
    return Promise.resolve([...this.disks.values()]);
  }

  public read(id: string): Promise<ISaveDisk | null> {
    return Promise.resolve(this.disks.get(id) ?? null);
  }

  public put(disk: ISaveDisk): Promise<void> {
    this.disks.set(disk.id, disk);

    return Promise.resolve();
  }

  public remove(id: string): Promise<void> {
    this.disks.delete(id);

    return Promise.resolve();
  }
}


export type NewDiskResult =
  | { readonly ok: true; readonly disk: ISaveDisk }
  | { readonly ok: false; readonly reason: 'full'; readonly message: string };


/** Counts disks made in this session, so the last resort below still tells them apart. */
let disksMade: number = 0;


function newIdentifier(): string {
  const random: Crypto | undefined = globalThis.crypto;

  if (random?.randomUUID != null) {
    return random.randomUUID();
  } else if (random?.getRandomValues != null) {
    // randomUUID is only offered over a secure connection; this is not.
    const bytes: Uint8Array = random.getRandomValues(new Uint8Array(16));

    return [...bytes].map((byte: number): string => byte.toString(16).padStart(2, '0')).join('');
  } else {
    // No source of randomness at all. Ids only have to tell six disks apart, so the clock and a
    // count do that perfectly well.
    disksMade = disksMade + 1;

    return `disk-${ Date.now() }-${ disksMade }`;
  }
}


/** The player's shelf of disks: what is on it, and the rules about adding to it. */
export class SaveDiskLibrary {
  constructor(private readonly store: ISaveDiskStore,
                     private readonly limit: number = MAXIMUM_SAVE_DISKS) {
  }


  /** Most recently played first, which is the order a player looks for them in. */
  public async list(): Promise<ISaveDiskSummary[]> {
    const disks: ISaveDisk[] = await this.store.list();

    return disks
      .map((disk: ISaveDisk): ISaveDiskSummary => ({
        id: disk.id,
        name: disk.name,
        gameName: disk.gameName,
        createdAt: disk.createdAt,
        playedAt: disk.playedAt,
      }))
      .sort((first: ISaveDiskSummary, second: ISaveDiskSummary): number => second.playedAt - first.playedAt);
  }


  public read(id: string): Promise<ISaveDisk | null> {
    return this.store.read(id);
  }


  public async isFull(): Promise<boolean> {
    return (await this.store.list()).length >= this.limit;
  }


  /** A name not already taken, so a shelf of disks stays tellable apart. */
  public async suggestName(): Promise<string> {
    const taken: ReadonlySet<string> = new Set((await this.store.list()).map((disk: ISaveDisk): string => disk.name));

    for (let number: number = 1; number <= (this.limit + 1); number++) {
      const name: string = `DISK ${ number }`;

      if (!taken.has(name)) {
        return name;
      }
    }

    return `DISK ${ Date.now() }`;
  }


  /**
   * Copies a scenario onto a new disk, the way the game's own utilities made a new scenario
   * diskette. The bytes usually come from the master, but an imported save disk arrives the same
   * way, since a save disk is itself a whole scenario.
   */
  public async createFromScenario(scenarioData: Uint8Array,
                                  scenarioMessages: Uint8Array | null,
                                  gameName: string,
                                  name: string): Promise<NewDiskResult> {
    if (await this.isFull()) {
      return {
        ok: false,
        reason: 'full',
        message: `There is room for ${ this.limit } character disks. Delete one to make another.`,
      };
    } else {
      const now: number = Date.now();
      const disk: ISaveDisk = {
        id: newIdentifier(),
        name: name.trim() || await this.suggestName(),
        gameName,
        createdAt: now,
        playedAt: now,
        scenarioData: scenarioData.slice(),
        scenarioMessages: scenarioMessages?.slice() ?? null,
      };

      await this.store.put(disk);

      return { ok: true, disk };
    }
  }


  /** Writes back what the game has changed, and notes that this disk was the one being played. */
  public async save(disk: ISaveDisk, scenarioData: Uint8Array): Promise<ISaveDisk> {
    const saved: ISaveDisk = { ...disk, scenarioData, playedAt: Date.now() };

    await this.store.put(saved);

    return saved;
  }


  public async rename(id: string, name: string): Promise<void> {
    const disk: ISaveDisk | null = await this.store.read(id);

    if ((disk !== null) && (name.trim().length > 0)) {
      await this.store.put({ ...disk, name: name.trim() });
    }
  }


  public remove(id: string): Promise<void> {
    return this.store.remove(id);
  }

}
