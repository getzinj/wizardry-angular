// Reading 512-byte blocks out of a 5.25-inch floppy image.
//
// Pascal numbered the disk in blocks, but the drive stored 256-byte sectors, and the two halves of
// a block are not adjacent sectors: they are spread around the track so the head has time to
// process one before the next arrives. Image files come in two flavours depending on which order
// the tool that made them wrote the sectors in, and nothing in the file says which. Rather than
// ask, the reader tries both and keeps whichever produces a directory that makes sense.

export const BLOCK_SIZE: number = 512;
export const SECTOR_SIZE: number = 256;
export const SECTORS_PER_TRACK: number = 16;
export const BLOCKS_PER_TRACK: number = 8;

/** A 35-track, 16-sector disk: the standard Apple II floppy. */
export const STANDARD_IMAGE_SIZE: number = 35 * SECTORS_PER_TRACK * SECTOR_SIZE;

/**
 * For each block within a track, the two sectors holding its halves. This interleave is what the
 * operating system used, and reading an image written in sector order means undoing it.
 */
export const SECTOR_PAIRS: readonly (readonly [number, number])[] = [
  [0, 14], [13, 12], [11, 10], [9, 8], [7, 6], [5, 4], [3, 2], [1, 15],
];

export type SectorOrder = 'dos' | 'prodos';


/** A disk read the right way round, and what reading it produced. */
export interface IReadDisk<T> {
  readonly disk: DiskImage;
  readonly contents: T;
}


export class DiskImage {
  private constructor(private readonly image: Uint8Array, public readonly order: SectorOrder) {
  }


  /** Wraps an image whose sector order is already known. */
  public static withOrder(image: Uint8Array, order: SectorOrder): DiskImage {
    return new DiskImage(image, order);
  }


  /**
   * Works out an image's sector order by reading it each way round and keeping the way that makes
   * sense, returning what was read along with the disk that read it. Null means neither way
   * worked, which is what an image that is not an Apple Pascal disk looks like.
   */
  public static detectOrder<T>(image: Uint8Array,
                               read: (disk: DiskImage) => T | null): IReadDisk<T> | null {
    for (const order of [ 'dos', 'prodos' ] as const) {
      const disk: DiskImage = new DiskImage(image, order);
      const contents: T | null = read(disk);

      if (contents !== null) {
        return { disk, contents };
      }
    }

    return null;
  }


  public get blockCount(): number {
    return Math.floor(this.image.length / BLOCK_SIZE);
  }


  public readBlock(block: number): Uint8Array {
    if ((block < 0) || (block >= this.blockCount)) {
      throw new RangeError(`block ${ block } is outside a disk of ${ this.blockCount } blocks`);
    } else if (this.order === 'prodos') {
      return this.image.slice(block * BLOCK_SIZE, (block + 1) * BLOCK_SIZE);
    } else {
      return this.readInterleavedBlock(block);
    }
  }


  /** Reads a run of blocks into one buffer, as the game does when it loads a whole file. */
  public readBlocks(firstBlock: number, count: number): Uint8Array {
    const bytes: Uint8Array = new Uint8Array(count * BLOCK_SIZE);

    for (let index: number = 0; index < count; index++) {
      bytes.set(this.readBlock(firstBlock + index), index * BLOCK_SIZE);
    }

    return bytes;
  }


  private readInterleavedBlock(block: number): Uint8Array {
    const track: number = Math.floor(block / BLOCKS_PER_TRACK);
    const [ first, second ]: readonly [number, number] = SECTOR_PAIRS[block % BLOCKS_PER_TRACK];
    const bytes: Uint8Array = new Uint8Array(BLOCK_SIZE);

    bytes.set(this.readSector(track, first), 0);
    bytes.set(this.readSector(track, second), SECTOR_SIZE);

    return bytes;
  }


  private readSector(track: number, sector: number): Uint8Array {
    const start: number = ((track * SECTORS_PER_TRACK) + sector) * SECTOR_SIZE;

    return this.image.subarray(start, start + SECTOR_SIZE);
  }

}
