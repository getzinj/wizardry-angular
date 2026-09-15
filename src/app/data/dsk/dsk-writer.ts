import {
  BLOCKS_PER_TRACK, BLOCK_SIZE, SECTORS_PER_TRACK, SECTOR_PAIRS, SECTOR_SIZE, STANDARD_IMAGE_SIZE
} from './dsk-image';

// Writing a disk image, so a save disk can leave the browser as a real disk rather than as some
// format of our own. What comes out is an ordinary Apple Pascal floppy: this app will read it back,
// and so will an emulator or any tool that handles Apple II disks.
//
// Written in the sector order the operating system used, which is the order the reader undoes.

const DIRECTORY_FIRST_BLOCK: number = 2;
const DIRECTORY_BLOCKS: number = 4;
const ENTRY_SIZE: number = 26;

/** First block after the directory, which is what the volume's own entry records as its end. */
const VOLUME_END_BLOCK: number = DIRECTORY_FIRST_BLOCK + DIRECTORY_BLOCKS;

/** Blocks on a 5.25-inch disk. */
const VOLUME_BLOCKS: number = STANDARD_IMAGE_SIZE / BLOCK_SIZE;

/** Longest a volume name may be; file names may be longer. */
const MAXIMUM_VOLUME_NAME: number = 7;
const MAXIMUM_FILE_NAME: number = 15;

/** The file kind used for data files, matching what the game's own disks carry. */
const DATA_FILE_KIND: number = 5;

// Offsets within a directory entry.
const FIRST_BLOCK: number = 0;
const LAST_BLOCK: number = 2;
const KIND: number = 4;
const NAME: number = 6;
const END_OF_VOLUME: number = 14;
const FILE_COUNT: number = 16;


export interface IDiskFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}


function writeWord(image: Uint8Array, offset: number, value: number): void {
  image[offset] = value & 0xFF;
  image[offset + 1] = (value >> 8) & 0xFF;
}


function writeString(image: Uint8Array, offset: number, text: string): void {
  image[offset] = text.length;

  for (let index: number = 0; index < text.length; index++) {
    image[offset + 1 + index] = text.charCodeAt(index);
  }
}


/** Writes one block into the image, splitting it across the two sectors that hold its halves. */
function writeBlock(image: Uint8Array, block: number, bytes: Uint8Array): void {
  const track: number = Math.floor(block / BLOCKS_PER_TRACK);
  const [ first, second ]: readonly [number, number] = SECTOR_PAIRS[block % BLOCKS_PER_TRACK];

  image.set(bytes.subarray(0, SECTOR_SIZE), ((track * SECTORS_PER_TRACK) + first) * SECTOR_SIZE);
  image.set(bytes.subarray(SECTOR_SIZE, BLOCK_SIZE), ((track * SECTORS_PER_TRACK) + second) * SECTOR_SIZE);
}


/**
 * Trims a name to what a Pascal volume will hold. Names are upper case, and anything that is not a
 * letter or a digit is dropped rather than substituted, so a name stays recognisable.
 */
export function toVolumeName(name: string, fallback: string = 'WIZSAVE'): string {
  const cleaned: string = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAXIMUM_VOLUME_NAME);

  return (cleaned.length > 0) ? cleaned : fallback;
}


/**
 * Lays out a disk image holding the given files, starting after the directory and running one
 * after another, which is how the game's own disks are arranged.
 */
export function buildDiskImage(volumeName: string, files: readonly IDiskFile[]): Uint8Array {
  const image: Uint8Array = new Uint8Array(STANDARD_IMAGE_SIZE);
  const directory: Uint8Array = new Uint8Array(DIRECTORY_BLOCKS * BLOCK_SIZE);

  writeWord(directory, FIRST_BLOCK, 0);
  writeWord(directory, LAST_BLOCK, VOLUME_END_BLOCK);
  writeWord(directory, KIND, 0);
  writeString(directory, NAME, toVolumeName(volumeName));
  writeWord(directory, END_OF_VOLUME, VOLUME_BLOCKS);
  writeWord(directory, FILE_COUNT, files.length);

  let nextBlock: number = VOLUME_END_BLOCK;

  files.forEach((file: IDiskFile, index: number): void => {
    const blockCount: number = Math.ceil(file.bytes.length / BLOCK_SIZE);
    const entry: number = (index + 1) * ENTRY_SIZE;

    if ((nextBlock + blockCount) > VOLUME_BLOCKS) {
      throw new Error(`${ file.name } does not fit on the disk`);
    }

    writeWord(directory, entry + FIRST_BLOCK, nextBlock);
    writeWord(directory, entry + LAST_BLOCK, nextBlock + blockCount);
    writeWord(directory, entry + KIND, DATA_FILE_KIND);
    writeString(directory, entry + NAME, file.name.slice(0, MAXIMUM_FILE_NAME));

    for (let block: number = 0; block < blockCount; block++) {
      const start: number = block * BLOCK_SIZE;
      const chunk: Uint8Array = new Uint8Array(BLOCK_SIZE);

      chunk.set(file.bytes.subarray(start, Math.min(start + BLOCK_SIZE, file.bytes.length)));
      writeBlock(image, nextBlock + block, chunk);
    }

    nextBlock = nextBlock + blockCount;
  });

  for (let block: number = 0; block < DIRECTORY_BLOCKS; block++) {
    writeBlock(image, DIRECTORY_FIRST_BLOCK + block,
               directory.subarray(block * BLOCK_SIZE, (block + 1) * BLOCK_SIZE));
  }

  return image;
}
