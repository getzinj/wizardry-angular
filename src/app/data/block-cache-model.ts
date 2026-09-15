// When the drive would have moved.
//
// The original read the scenario through one 1024-byte buffer, IOCACHE, and two variables: CACHEBL,
// the block pair sitting in it, and CACHEWRI, whether that pair had been written to. GETREC on a
// pair already in the buffer touched no hardware; on any other pair it wrote the dirty one out
// first and read the new one in. That bookkeeping is what decided when the disk drive span, and it
// is kept here without the bytes, purely to say so: the scenario itself is whole in memory and
// needs no cache.

export interface IDriveActivity {
  /** The motor was off and had to come up to speed first. */
  readonly spinUp: boolean;
  /** A dirty block pair was written out. */
  readonly wrote: boolean;
  /** A block pair was read in. */
  readonly read: boolean;
}


export const NO_ACTIVITY: IDriveActivity = { spinUp: false, wrote: false, read: false };


export class BlockCacheModel {
  /** CACHEBL: the block pair in the buffer, or null when nothing is. */
  private cachedPair: number | null = null;

  /** CACHEWRI: whether that pair has been written to since it was read. */
  private dirty: boolean = false;

  /**
   * The Disk II switched its motor off about a second after the last access. Here it is switched
   * off whenever the game stops to wait for a key, which is when that second went by.
   */
  private motorRunning: boolean = false;


  /** GETREC or GETRECW on a record in this block pair. */
  public access(pair: number, writing: boolean): IDriveActivity {
    let activity: IDriveActivity;

    if (pair === this.cachedPair) {
      activity = NO_ACTIVITY;
    } else {
      activity = this.transfer();
      this.cachedPair = pair;
      this.dirty = false;
    }

    if (writing) {
      this.dirty = true;
    }

    return activity;
  }


  /**
   * UNITREAD straight into the buffer, which is how the fonts, the spell books and the message
   * blocks came in. It went past the bookkeeping, so whatever pair the buffer held is gone, and
   * a dirty one is gone unwritten: the game had to force it out with a GETREC first.
   */
  public rawRead(): IDriveActivity {
    const spinUp: boolean = !this.motorRunning;

    this.motorRunning = true;
    this.cachedPair = null;
    this.dirty = false;

    return { spinUp, wrote: false, read: true };
  }


  /** The game has stopped to wait for a key, so the motor has had time to switch itself off. */
  public rest(): void {
    this.motorRunning = false;
  }


  /** INITGAME: CACHEBL := -1 and CACHEWRI := FALSE, so a dirty pair at that point is simply lost. */
  public reset(): void {
    this.cachedPair = null;
    this.dirty = false;
    this.motorRunning = false;
  }


  /** Another pair is wanted: the dirty one, if it is, goes out first, and the new one comes in. */
  private transfer(): IDriveActivity {
    const spinUp: boolean = !this.motorRunning;

    this.motorRunning = true;

    return { spinUp, wrote: this.dirty, read: true };
  }

}
