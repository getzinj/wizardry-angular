import type { ILayout } from './layout/ucsd-layout';
import type { Zone } from './layout/wiz-types';
import { scenarioToc } from './layout/wiz-types';

export const BLOCK_SIZE: number = 512;

/**
 * The scenario file, addressed the way the game addresses it.
 *
 * The game never opens a file. It reads raw pairs of blocks into a buffer and copies records out
 * of that buffer at a computed offset, so a record's address is worked out from three numbers in
 * the table of contents: where the zone starts, how many records fit in a pair of blocks, and how
 * big a record is. Keeping that arithmetic means a record lands where the game expects even where
 * the packing looks odd, such as the thirteen items that fit a pair with bytes to spare.
 *
 * The whole file is small enough to hold in memory, so reads need no cache. Writes will: the game
 * keeps a dirty pair and only flushes it when another pair is needed, which is why saving is
 * bound up with reading something else.
 */
export class ScenarioDisk {
  public readonly toc: ReturnType<typeof scenarioToc.read>;

  /** Set once anything has been written, so the disk is only saved when there is something to save. */
  public changed: boolean = false;

  /**
   * Called the moment a write lands, so whoever owns the disk can get it to storage.
   *
   * The original's block cache held a dirty pair until it needed the buffer for something else,
   * and the game is dotted with reads it does not want, placed exactly where the write had to be
   * on the floppy before anything else could happen. Those places matter: INITGAME clears CACHEWRI
   * outright, so a pair still dirty when the game restarts is simply lost. This is how the same
   * "get it down now" is said here.
   */
  public onChanged: (() => void) | null = null;


  /**
   * The scenario's messages, which are a second file on the disk. The game finds it by name and
   * reads its blocks straight into a buffer of its own, so it is kept whole and unparsed here. A
   * disk without one is allowed: the game looks for it each time it needs a message and says so on
   * screen when it is missing.
   */
  constructor(private readonly bytes: Uint8Array,
              private readonly messages: Uint8Array | null = null) {
    this.toc = scenarioToc.read(bytes, 0);
  }


  /** Whether the disk carries the messages file at all, which is all the game asks FINDFILE for. */
  public get hasMessages(): boolean {
    return this.messages !== null;
  }


  /**
   * One block of the messages file.
   *
   * The game reads these as raw volume blocks, so reading past the end of the file gave it the
   * bytes of whatever lay next on the disk. There is nothing next here, so a block past the end
   * comes back zeroed - and a zeroed block says no line is a message's last, which is a difference
   * only a truncated file could reach.
   */
  public messageBlock(block: number): Uint8Array {
    const bytes: Uint8Array = new Uint8Array(BLOCK_SIZE);

    if (this.messages !== null) {
      const start: number = block * BLOCK_SIZE;

      bytes.set(this.messages.subarray(start, start + BLOCK_SIZE));
    }

    return bytes;
  }


  /**
   * The disk's contents, for writing back to the save disk it came from. The game alters these as
   * it plays, so a save is this buffer rather than anything extracted from it.
   */
  public get contents(): Uint8Array {
    return this.bytes;
  }


  /** Records of this kind the disk holds. */
  public recordCount(zone: Zone): number {
    return this.toc.recordsOnDisk[zone];
  }


  /** Reads one record, as the game does by copying out of its block buffer. */
  public read<T>(zone: Zone, index: number, layout: ILayout<T>): T {
    return layout.read(this.bytes, this.recordOffset(zone, index, layout.size));
  }


  /**
   * Writes one record back. This is how a character is saved: the game had no save file, so
   * keeping a character meant writing their record onto the scenario disk where it was read from.
   *
   * The original marked the block pair dirty and only wrote it out when it next needed the buffer
   * for something else, which is why its code is dotted with reads of records it does not want,
   * purely to force the write. Holding the whole scenario in memory removes the buffer and so
   * removes the need for those: the change lands here, and `changed` tells whoever owns the disk
   * that it is worth writing to storage.
   */
  public write<T>(zone: Zone, index: number, layout: ILayout<T>, value: T): void {
    layout.write(this.bytes, this.recordOffset(zone, index, layout.size), value);
    this.touched();
  }


  /**
   * FILLCHAR over a record: zeroes the slot, padding bytes and spare bits included.
   *
   * A record the game builds from nothing starts with FILLCHAR( CHARREC, SIZEOF( CHARREC), 0) and
   * is then written out whole, so every byte of the slot it lands in is cleared - including the
   * ones no field claims. Writing fields alone would leave the previous occupant's spare bits
   * behind, which is how a newly rolled character could inherit a spell from the one deleted
   * before them.
   */
  public fillchar<T>(zone: Zone, index: number, layout: ILayout<T>): void {
    const at: number = this.recordOffset(zone, index, layout.size);

    this.bytes.fill(0, at, at + layout.size);
    this.touched();
  }


  private touched(): void {
    this.changed = true;
    this.onChanged?.();
  }


  /**
   * A record the game copies raw bytes out of rather than fields: the monster and chest pictures,
   * which are bitmaps. GETREC handed back an offset into the block buffer and the caller walked
   * along it; this hands back the record's bytes for the caller to walk along instead.
   */
  public readRecord(zone: Zone, index: number, size: number): Uint8Array {
    const at: number = this.recordOffset(zone, index, size);

    return this.bytes.slice(at, at + size);
  }


  /** A whole block, for the things stored as raw bytes: the fonts and the pictures. */
  public readBlock(blockWithinFile: number): Uint8Array {
    const start: number = blockWithinFile * BLOCK_SIZE;

    return this.bytes.slice(start, start + BLOCK_SIZE);
  }


  /**
   * Where a record sits, by the arithmetic of GETREC: its zone's first block, plus two blocks per
   * full pair, plus whole records within the pair. DIV and MOD in Pascal truncate towards zero,
   * which is not what Math.floor and % do for a negative index, so the division is written out.
   *
   * The original had no bounds check and neither has this, because the game reaches past the end
   * of a zone on purpose in places. Reaching past the end of the disk is different: a store past
   * the end of a typed array is silently dropped, so a save could report success having written
   * nothing at all. That is refused instead.
   */
  private recordOffset(zone: Zone, index: number, recordSize: number): number {
    const perPair: number = this.toc.recordsPerBlockPair[zone];
    const pair: number = this.toc.blockOffset[zone] + (2 * Math.trunc(index / perPair));
    const offset: number = (pair * BLOCK_SIZE) + (recordSize * (index % perPair));

    if ((offset < 0) || ((offset + recordSize) > this.bytes.length)) {
      throw new RangeError(`record ${ index } of zone ${ zone } lies outside the scenario`);
    } else {
      return offset;
    }
  }

}


/** The block after the table of contents holds the text font, and the one after that the frame. */
export const TEXT_FONT_BLOCK: number = 1;
export const GRAPHICS_FONT_BLOCK: number = 2;
