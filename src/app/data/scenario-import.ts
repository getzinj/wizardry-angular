import type { IReadDisk, SectorOrder } from './dsk/dsk-image';
import { BLOCK_SIZE, DiskImage, STANDARD_IMAGE_SIZE } from './dsk/dsk-image';
import type { IDirectoryEntry, IVolumeDirectory } from './dsk/ucsd-directory';
import { findFile, readDirectory } from './dsk/ucsd-directory';
import { Zone, ZONE_COUNT, character, maze, monster, object, scenarioToc } from './layout/wiz-types';

// Taking a disk image from the player and deciding whether it is the one the game needs.
//
// Players supply their own copy of the game, so this has to cope with whatever they hand over: a
// file that is not a disk at all, a disk in a format this cannot read, an Apple Pascal disk from
// something else entirely, or, most likely of all, the boot disk instead of the scenario disk.
// Each of those gets its own answer, because "that didn't work" is no help when the fix is to go
// and find the other floppy.
//
// Nothing here touches the network or the filesystem, so the same checks run in the browser and
// on the command line.

export const SCENARIO_DATA: string = 'SCENARIO.DATA';
export const SCENARIO_MESSAGES: string = 'SCENARIO.MESGS';

/** The game's own code file, present on both disks. Its presence tells us this is a Wizardry disk. */
const GAME_CODE: string = 'WIZARDRY.CODE';

const BLOCK_PAIR_BYTES: number = 2 * BLOCK_SIZE;

/** Record sizes the layouts compute, for the zones whose records are all one size. */
const ZONE_RECORD_SIZES: Readonly<Partial<Record<Zone, number>>> = {
  [Zone.maze]: maze.size,
  [Zone.monster]: monster.size,
  [Zone.object]: object.size,
  [Zone.character]: character.size,
};

const ZONE_NAMES: readonly string[] = [
  'contents', 'maze levels', 'monsters', 'rewards', 'items', 'characters', 'pictures', 'experience',
];


export type ScenarioProblem =
  /** Nothing to read. */
  | 'empty'

  /** Too small, or not a whole number of blocks. */
  | 'wrong-size'

  /** A disk image, but in a container this cannot read. */
  | 'unsupported-format'

  /** Readable as blocks, but holds no Apple Pascal directory in either sector order. */
  | 'not-a-pascal-disk'

  /** An Apple Pascal disk, but not one of Wizardry's. */
  | 'not-a-wizardry-disk'

  /** A Wizardry disk, but the boot side rather than the scenario side. */
  | 'boot-disk'

  /** The scenario file is there but does not read as one. */
  | 'damaged-scenario';


export interface IScenarioSummary {
  readonly gameName: string;
  readonly volumeName: string;
  readonly sectorOrder: SectorOrder;
  readonly mazeLevels: number;
  readonly monsters: number;
  readonly items: number;
  readonly rosterSize: number;
}


/** The files lifted off the disk. This, not the disk image, is what gets kept. */
export interface IScenarioFiles {
  readonly summary: IScenarioSummary;
  readonly scenarioData: Uint8Array;
  readonly scenarioMessages: Uint8Array | null;
}


export type ScenarioImportResult =
  | { readonly ok: true; readonly files: IScenarioFiles }
  | { readonly ok: false; readonly problem: ScenarioProblem; readonly message: string; readonly detail: readonly string[] };


function rejected(problem: ScenarioProblem, message: string, detail: readonly string[] = []): ScenarioImportResult {
  return { ok: false, problem, message, detail };
}


function startsWith(bytes: Uint8Array, text: string): boolean {
  return [...text].every((character: string, index: number): boolean => bytes[index] === character.charCodeAt(0));
}


/** Containers this cannot read, named so the player knows what to convert from. */
function unsupportedContainer(bytes: Uint8Array): string | null {
  if (startsWith(bytes, '2IMG')) {
    return 'a 2MG image';
  } else if (startsWith(bytes, 'WOZ1') || startsWith(bytes, 'WOZ2')) {
    return 'a WOZ image';
  } else {
    return null;
  }
}


function checkSize(bytes: Uint8Array): ScenarioImportResult | null {
  const container: string | null = unsupportedContainer(bytes);

  if (bytes.length === 0) {
    return rejected('empty', 'That file is empty.');
  } else if (container != null) {
    return rejected('unsupported-format',
                    `That is ${ container }, which this cannot read.`,
                    ['Convert it to a plain .dsk or .po image first, with CiderPress or a similar tool.']);
  } else if ((bytes.length % BLOCK_SIZE) !== 0) {
    return rejected('wrong-size',
                    'That file is not a disk image.',
                    [`A disk image is a whole number of 512-byte blocks; this is ${ bytes.length } bytes.`]);
  } else if (bytes.length < STANDARD_IMAGE_SIZE) {
    return rejected('wrong-size',
                    'That file is too small to be a Wizardry disk.',
                    [`A 5.25-inch disk is ${ STANDARD_IMAGE_SIZE } bytes; this is ${ bytes.length }.`]);
  } else {
    return null;
  }
}


/**
 * Checks the record sizes against what the disk says about itself. A scenario built for a
 * different game, or a file that only looks like one, fails here rather than much later as
 * garbled text.
 */
function checkContents(toc: ReturnType<typeof scenarioToc.read>, fileBlocks: number): string[] {
  const problems: string[] = [];

  if (toc.gameName.trim().length === 0) {
    problems.push('it has no scenario name');
  }

  for (let zone: number = 0; zone < ZONE_COUNT; zone++) {
    const perPair: number = toc.recordsPerBlockPair[zone];
    const onDisk: number = toc.recordsOnDisk[zone];
    const size: number | undefined = ZONE_RECORD_SIZES[zone as Zone];

    if ((perPair <= 0) || (onDisk < 0)) {
      problems.push(`its ${ ZONE_NAMES[zone] } section is not described properly`);
    } else if ((size != null) && ((size * perPair) > BLOCK_PAIR_BYTES)) {
      problems.push(`its ${ ZONE_NAMES[zone] } are laid out differently from this version of the game`);
    } else if ((toc.blockOffset[zone] + (2 * Math.ceil(onDisk / perPair))) > fileBlocks) {
      problems.push(`its ${ ZONE_NAMES[zone] } run past the end of the file`);
    }
  }

  if (toc.recordsOnDisk[Zone.maze] <= 0) {
    problems.push('it holds no maze levels');
  }

  return problems;
}


/**
 * Reads a disk image the player has supplied and returns the scenario files, or says what is
 * wrong with it.
 */
export function importScenarioDisk(bytes: Uint8Array): ScenarioImportResult {
  const sizeProblem: ScenarioImportResult | null = checkSize(bytes);

  if (sizeProblem != null) {
    return sizeProblem;
  }

  const found: IReadDisk<IVolumeDirectory> | null = DiskImage.detectOrder(bytes, readDirectory);

  if (found === null) {
    return rejected('not-a-pascal-disk',
                    'That disk is not an Apple Pascal disk.',
                    ['Wizardry disks are; this one has no directory this could read, in either sector order.']);
  }

  const { disk, contents: volume } = found;
  const data: IDirectoryEntry | null = findFile(volume, SCENARIO_DATA);

  if (data == null) {
    const fileNames: string[] = volume.files.map((file: IDirectoryEntry): string => file.name);

    if (findFile(volume, GAME_CODE) != null) {
      return rejected('boot-disk',
                      'That is the Wizardry boot disk. The scenario disk is the one this needs.',
                      [`The boot disk holds the program. The scenario disk holds ${ SCENARIO_DATA }, which is` +
                       ' where the dungeon, the monsters and your characters live.']);
    } else {
      return rejected('not-a-wizardry-disk',
                      `That disk holds no ${ SCENARIO_DATA }.`,
                      [`Volume ${ volume.volumeName } contains: ${ fileNames.join(', ') || 'nothing' }.`]);
    }
  }

  const scenarioData: Uint8Array = disk.readBlocks(data.firstBlock, data.blockCount);
  const toc: ReturnType<typeof scenarioToc.read> = scenarioToc.read(scenarioData, 0);
  const problems: string[] = checkContents(toc, data.blockCount);

  if (problems.length > 0) {
    return rejected('damaged-scenario',
                    `That disk's ${ SCENARIO_DATA } could not be read.`,
                    problems.map((problem: string): string => `This disk says ${ problem }.`));
  }

  const messages: IDirectoryEntry | null = findFile(volume, SCENARIO_MESSAGES);

  return {
    ok: true,
    files: {
      summary: {
        gameName: toc.gameName,
        volumeName: volume.volumeName,
        sectorOrder: disk.order,
        mazeLevels: toc.recordsOnDisk[Zone.maze],
        monsters: toc.recordsOnDisk[Zone.monster],
        items: toc.recordsOnDisk[Zone.object],
        rosterSize: toc.recordsOnDisk[Zone.character],
      },
      scenarioData,
      scenarioMessages: (messages != null) ? disk.readBlocks(messages.firstBlock, messages.blockCount) : null,
    },
  };
}
