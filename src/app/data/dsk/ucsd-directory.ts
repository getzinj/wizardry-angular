import type { DiskImage } from './dsk-image';
import { BLOCK_SIZE } from './dsk-image';

// The volume directory of an Apple Pascal disk: a fixed table at blocks 2 to 5, one 26-byte entry
// per file, with the first entry describing the volume itself. The game reads this table itself
// rather than opening files, which is why the port needs it too.

const DIRECTORY_FIRST_BLOCK: number = 2;
const DIRECTORY_BLOCKS: number = 4;
const ENTRY_SIZE: number = 26;

/** Files a volume can hold, so a wild length here is a sign the sector order is wrong. */
const MAXIMUM_FILES: number = 77;

/** Where the volume's own entry ends and the files begin. */
const VOLUME_LAST_BLOCK: number = 6;

// Offsets within an entry.
const FIRST_BLOCK: number = 0;
const LAST_BLOCK: number = 2;
const KIND: number = 4;
const NAME: number = 6;
const FILE_COUNT: number = 16;

/** Longest name an entry can hold. The volume's own name is shorter, at 7. */
const MAXIMUM_NAME_LENGTH: number = 15;


export interface IDirectoryEntry {
  readonly name: string;

  /** First block of the file, numbered from the start of the disk. */
  readonly firstBlock: number;

  /** One past the file's last block, which is how the directory stores it. */
  readonly endBlock: number;

  readonly blockCount: number;
  readonly kind: number;
}


export interface IVolumeDirectory {
  readonly volumeName: string;
  readonly files: readonly IDirectoryEntry[];
}


function readWord(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}


function readName(bytes: Uint8Array, offset: number, maximumLength: number): string | null {
  const length: number = bytes[offset];

  if ((length < 1) || (length > maximumLength)) {
    return null;
  } else {
    let name: string = '';

    for (let index: number = 1; index <= length; index++) {
      const code: number = bytes[offset + index];

      if ((code < 32) || (code > 126)) {
        return null;
      } else {
        name = name + String.fromCharCode(code);
      }
    }

    return name;
  }
}


/**
 * Reads the directory, or returns null if what is there is not one. Sector-order detection leans
 * on that: read the wrong way round, the bytes fail these checks.
 */
export function readDirectory(disk: DiskImage): IVolumeDirectory | null {
  if (disk.blockCount < (DIRECTORY_FIRST_BLOCK + DIRECTORY_BLOCKS)) {
    return null;
  }

  const bytes: Uint8Array = disk.readBlocks(DIRECTORY_FIRST_BLOCK, DIRECTORY_BLOCKS);
  const volumeName: string | null = readName(bytes, NAME, 7);
  const fileCount: number = readWord(bytes, FILE_COUNT);

  const looksLikeAVolume: boolean = (readWord(bytes, FIRST_BLOCK) === 0) &&
                                    (readWord(bytes, LAST_BLOCK) === VOLUME_LAST_BLOCK) &&
                                    (volumeName != null) &&
                                    (fileCount <= MAXIMUM_FILES) &&
                                    (((fileCount + 1) * ENTRY_SIZE) <= (DIRECTORY_BLOCKS * BLOCK_SIZE));

  if (looksLikeAVolume) {
    const files: IDirectoryEntry[] = [];

    for (let index: number = 1; index <= fileCount; index++) {
      const entry: number = index * ENTRY_SIZE;
      const name: string | null = readName(bytes, entry + NAME, MAXIMUM_NAME_LENGTH);
      const firstBlock: number = readWord(bytes, entry + FIRST_BLOCK);
      const endBlock: number = readWord(bytes, entry + LAST_BLOCK);

      if ((name == null) || (endBlock <= firstBlock)) {
        return null;
      }

      files.push({
        name,
        firstBlock,
        endBlock,
        blockCount: endBlock - firstBlock,
        kind: readWord(bytes, entry + KIND) & 0x0F,
      });
    }

    return { volumeName: volumeName as string, files };
  } else {
    return null;
  }
}


export function findFile(directory: IVolumeDirectory, name: string): IDirectoryEntry | null {
  return directory.files.find((file: IDirectoryEntry): boolean => file.name === name) ?? null;
}
