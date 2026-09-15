import { BLOCK_SIZE, STANDARD_IMAGE_SIZE } from './dsk/dsk-image';
import { ENDMSG_AT, MESSAGES_PER_BLOCK, MESSAGE_BYTES, MESSAGE_TEXT } from './message-record';
import type { IWizardryLong } from './layout/ucsd-layout';
import type { IExperienceTable, IMaze, IReward } from './layout/wiz-types';
import { ZONE_COUNT, Zone, experienceTable, maze, monster, object, reward } from './layout/wiz-types';
import { ScenarioDisk } from './scenario-disk';

// Synthetic disks for the tests, so none of them needs the game's own data. Laid out in ProDOS
// order, where a block sits at its own offset; the reader works out which order it is given.

const DIRECTORY_BLOCK: number = 2;
const ENTRY_SIZE: number = 26;
const VOLUME_END_BLOCK: number = 6;

/** Where a made-up scenario file starts, and how long it is. */
export const SCENARIO_FIRST_BLOCK: number = 6;
export const SCENARIO_BLOCKS: number = 42;
export const MESSAGE_BLOCKS: number = 15;

/**
 * Block 0 is the table of contents, blocks 1 and 2 are the fonts, block 3 is what the copy
 * protection read and this port drops, and blocks 4 and 5 are the two spell books RDSPELLS lists
 * from. Records begin after all of that, at 6, which is where a real disk puts them.
 */
export const FIRST_RECORD_BLOCK: number = 6;

/** Where RDSPELLS reads each book of spell names from, counted from the table of contents. */
export const MAGE_SPELL_BLOCK: number = 4;
export const PRIEST_SPELL_BLOCK: number = 5;

/** What a made-up monster picture is made of: every other pixel lit, and the palette bit clear. */
export const PICTURE_PATTERN: number = 0x2A;

/** The chest's picture, told apart from the rest so a test can see which one is up. */
export const CHEST_PATTERN: number = 0x55;
export const CHEST_PICTURE: number = 18;

/** The one made-up monster there is a fixed number of, and how many are left of it. */
export const UNIQUE_MONSTER: number = 1;
export const UNIQUE_REMAINING: number = 3;

/** Which trap the made-up chests carry, and which reward pays an item rather than gold. */
const POISON_NEEDLE_TRAP: number = 1;
const ALARM_TRAP: number = 7;
export const ITEM_REWARD: number = 4;


export interface IFileEntry {
  readonly name: string;
  readonly firstBlock: number;
  readonly blockCount: number;
}


export function writeWord(disk: Uint8Array, offset: number, value: number): void {
  disk[offset] = value & 0xFF;
  disk[offset + 1] = (value >> 8) & 0xFF;
}


export function writeString(disk: Uint8Array, offset: number, text: string): void {
  disk[offset] = text.length;

  for (let index: number = 0; index < text.length; index++) {
    disk[offset + 1 + index] = text.charCodeAt(index);
  }
}


export function buildDisk(volumeName: string, files: readonly IFileEntry[]): Uint8Array {
  const disk: Uint8Array = new Uint8Array(STANDARD_IMAGE_SIZE);
  const directory: number = DIRECTORY_BLOCK * BLOCK_SIZE;

  writeWord(disk, directory, 0);
  writeWord(disk, directory + 2, VOLUME_END_BLOCK);
  writeWord(disk, directory + 4, 0);
  writeString(disk, directory + 6, volumeName);
  writeWord(disk, directory + 14, STANDARD_IMAGE_SIZE / BLOCK_SIZE);
  writeWord(disk, directory + 16, files.length);

  files.forEach((file: IFileEntry, index: number): void => {
    const entry: number = directory + ((index + 1) * ENTRY_SIZE);

    writeWord(disk, entry, file.firstBlock);
    writeWord(disk, entry + 2, file.firstBlock + file.blockCount);
    writeWord(disk, entry + 4, 5);
    writeString(disk, entry + 6, file.name);
  });

  return disk;
}


// Records each pair of blocks holds, and how many of each the made-up disk has. The pictures run to
// twenty because the game asks for particular ones by number: eighteen is the chest and nineteen the
// treasure out of it.
const PER_PAIR: readonly number[] = [6, 1, 6, 6, 13, 4, 2, 1];
// Eight roster slots rather than the six a party can hold: INSPECT lists at most five bodies, and
// showing that it stops at five takes a party member plus six of them on the disk.
const ON_DISK: readonly number[] = [1, 2, 6, 6, 13, 8, 20, 1];


// Where each of the four name tables begins in the table of contents, and the stride of one entry.
// A real disk spells out HUMAN, FIGHTER, OK and so on; these are made up, and deliberately look it,
// so a test that claims the sheet prints a race cannot be satisfied by a word printed for any other
// reason. The alignment names start with their own index because only their first letter is printed.
const NAME_TABLES: readonly { readonly at: number; readonly names: readonly string[] }[] = [
  { at: 106, names: [ 'RACE0', 'RACE1', 'RACE2', 'RACE3', 'RACE4', 'RACE5' ] },
  { at: 166, names: [ 'CLAS0', 'CLAS1', 'CLAS2', 'CLAS3', 'CLAS4', 'CLAS5', 'CLAS6', 'CLAS7' ] },
  { at: 246, names: [ 'STAT0', 'STAT1', 'STAT2', 'STAT3', 'STAT4', 'STAT5', 'STAT6', 'STAT7' ] },
  { at: 326, names: [ '0ALIGN', '1ALIGN', '2ALIGN', '3ALIGN' ] },
];
const NAME_STRIDE: number = 10;


/** Fills in a table of contents that satisfies every check, then lets a caller spoil one thing. */
export function writeTableOfContents(disk: Uint8Array,
                                     gameName: string,
                                     spoil: (disk: Uint8Array, toc: number) => void = (): void => {}): void {
  const toc: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;
  const perPair: readonly number[] = PER_PAIR;
  const onDisk: readonly number[] = ON_DISK;

  writeString(disk, toc, gameName);

  // Records start past everything the disk keeps in named blocks of its own, which is what
  // FIRST_RECORD_BLOCK counts off. Zone zero is the table of contents itself and stays where it is.
  let blockOffset: number = FIRST_RECORD_BLOCK;

  for (let zone: number = 0; zone < ZONE_COUNT; zone++) {
    const blocks: number = 2 * Math.ceil(onDisk[zone] / perPair[zone]);

    writeWord(disk, toc + 42 + (zone * 2), perPair[zone]);
    writeWord(disk, toc + 58 + (zone * 2), onDisk[zone]);
    writeWord(disk, toc + 74 + (zone * 2), blocks);
    writeWord(disk, toc + 90 + (zone * 2), (zone === 0) ? 0 : blockOffset);

    if (zone > 0) {
      blockOffset = blockOffset + blocks;
    }
  }

  for (const table of NAME_TABLES) {
    table.names.forEach((name: string, index: number): void => {
      writeString(disk, toc + table.at + (index * NAME_STRIDE), name);
    });
  }

  spoil(disk, toc);
}


/**
 * Writes the two spell books RDSPELLS reads: one name per line, carriage-return separated, and an
 * empty line to stop. A name starting with a star tells PRSPELL to leave a gap before it, which is
 * how the original lines the groups up in columns; the fourth name of each book carries one, which
 * is what the row a listed spell lands on is measured against. The names are made up - a real disk
 * spells out the game's own.
 */
export function writeSpellBooks(disk: Uint8Array): void {
  const books: readonly { readonly block: number; readonly names: readonly string[] }[] = [
    { block: MAGE_SPELL_BLOCK, names: mageSpellNames() },
    { block: PRIEST_SPELL_BLOCK, names: priestSpellNames() },
  ];

  for (const book of books) {
    const at: number = (SCENARIO_FIRST_BLOCK + book.block) * BLOCK_SIZE;
    const text: string = `${ book.names.join('\r') }\r\r`;

    for (let index: number = 0; index < text.length; index++) {
      disk[at + index] = text.charCodeAt(index);
    }
  }
}


/** Spells 1 to 21, which is the mage's book, with a gap called for before the fourth. */
function mageSpellNames(): readonly string[] {
  return Array.from({ length: 21 }, (unused: unknown, index: number): string =>
    ((index === 3) ? '*' : '') + `MSPELL${ index + 1 }`);
}


/**
 * Spells 22 to 50, which is the priest's, with a gap called for before the twenty-fifth. The book
 * runs to 50 because that is where PRSPELL's counter stops; the original's SPELLSKN only reaches
 * 49, so the last name there reads the padding after the array and never lists.
 */
function priestSpellNames(): readonly string[] {
  return Array.from({ length: 29 }, (unused: unknown, index: number): string =>
    ((index === 3) ? '*' : '') + `PSPELL${ index + 22 }`);
}


/** Which made-up message each index holds. A real disk holds the scenario's own prose. */
export const FEE_MESSAGE: number = 24;
export const FEE_AND_PLACE_MESSAGE: number = 25;
export const RIDDLE_ANSWER_MESSAGE: number = 26;
export const RIDDLE_ANSWER: string = 'OPEN SESAME';


/**
 * Writes the messages file: one 42-byte record per line, twelve to a block.
 *
 * Indices below the three named above pair up into two-line messages, the even index first and the
 * odd one carrying the end flag, so asking for an even one prints two lines. The three named ones
 * are each a single line, and hold what FEEIS parses as a fee and what RIDDLES matches an answer
 * against. Everything here is made up; the real lines live on the player's own disk.
 */
export function messageFileBytes(): Uint8Array {
  const bytes: Uint8Array = new Uint8Array(MESSAGE_BLOCKS * BLOCK_SIZE);

  for (let index: number = 0; index < (MESSAGE_BLOCKS * MESSAGES_PER_BLOCK); index++) {
    const block: number = Math.trunc(index / MESSAGES_PER_BLOCK);
    const at: number = (block * BLOCK_SIZE) + (MESSAGE_BYTES * (index % MESSAGES_PER_BLOCK));
    let text: string = `MSG ${ index }`;
    let last: boolean = (index % 2) === 1;

    if (index === FEE_MESSAGE) {
      text = '500';
      last = true;
    } else if (index === FEE_AND_PLACE_MESSAGE) {
      text = 'B250';
      last = true;
    } else if (index === RIDDLE_ANSWER_MESSAGE) {
      text = RIDDLE_ANSWER;
      last = true;
    }

    bytes[at] = Math.min(text.length, MESSAGE_TEXT);

    for (let character: number = 0; character < bytes[at]; character++) {
      bytes[at + 1 + character] = text.charCodeAt(character);
    }

    writeWord(bytes, at + ENDMSG_AT, last ? 1 : 0);
  }

  return bytes;
}


/**
 * Fills both font blocks with solid glyphs, so anything drawn with them shows up as ink. A real
 * disk holds two 7x8 fonts here: the text one, and the box-drawing one the maze frame is made of.
 */
export function writeFonts(disk: Uint8Array): void {
  const first: number = (SCENARIO_FIRST_BLOCK + 1) * BLOCK_SIZE;

  disk.fill(0x7F, first, first + (2 * BLOCK_SIZE));
}


/**
 * Gives Boltac something to sell. His shelf is a ring of everything he has any of, and the search
 * that fills it spins until it finds one, so a disk with nothing in stock hangs the shop - which
 * is what the original does too, and what no real scenario disk can produce.
 *
 * The records are placed through ScenarioDisk, so they land wherever the table of contents says
 * rather than wherever this file thinks it put the zone.
 */
export function stockTheShop(disk: Uint8Array): void {
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;
  const scenario: ScenarioDisk =
    new ScenarioDisk(disk.subarray(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE)));

  for (let index: number = 0; index < scenario.recordCount(Zone.object); index++) {
    const record: ReturnType<typeof object.read> = object.read(new Uint8Array(object.size), 0);

    record.name = `ITEM ${ index }`;
    record.unidentifiedName = `?ITEM ${ index }`;
    record.stock = 1 + index;
    record.usableByClass = record.usableByClass.map((): number => 1);
    record.price.low = 10 * (index + 1);
    scenario.write(Zone.object, index, object, record);
  }
}


/**
 * Something to fight: one kind of monster, feeble, that turns up alone and keeps no company.
 *
 * UNIQUE is what says how many of a monster are left and is counted down as they are killed, so a
 * negative means there is no end of them; a zero sends the fight off to whatever ENMYTEAM names
 * instead, which is how the one-offs are used up. CALC1 says how many turn up and is rolled like
 * hit points, and a roll of no dice at all comes out as one.
 */
export function stockTheBestiary(disk: Uint8Array): void {
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;
  const scenario: ScenarioDisk =
    new ScenarioDisk(disk.subarray(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE)));

  for (let index: number = 0; index < scenario.recordCount(Zone.monster); index++) {
    const record: ReturnType<typeof monster.read> = monster.read(new Uint8Array(monster.size), 0);

    record.name = `BEAST ${ index }`;
    record.plural = `BEASTS ${ index }`;
    record.unidentifiedName = `CREATURE ${ index }`;
    record.unidentifiedPlural = `CREATURES ${ index }`;
    record.picture = 0;
    record.groupRoll = { low: 0, mid: 1, high: 0 };
    record.hitPoints = { diceCount: 1, diceSides: 1, bonus: 0 };
    record.attackCount = 1;
    record.attacks[0] = { diceCount: 1, diceSides: 1, bonus: 0 };

    // Hitting back feebly, so a fight in a test is over in a few rounds. The armour class has to be
    // a real one: REWARDS works out what a monster is worth partly from 40 * (11 - AC), so anything
    // above eleven is worth a negative amount and the arithmetic that adds it up is not built for
    // that - no monster on a real disk is armoured that badly.
    record.armourClass = 10;
    record.friends = -1;

    // A negative UNIQUE means there is no end of them; a positive one is how many are left, which
    // REWARDS counts down on the disk as they are killed.
    record.unique = (index === UNIQUE_MONSTER) ? UNIQUE_REMAINING : -1;
    scenario.write(Zone.monster, index, monster, record);
  }

  // Pictures to go with them, and with the chest. The game reads one of these whole rather than
  // field by field: fifty rows of ten bytes, dropped straight into video memory, so solid bytes
  // here are solid ink there.
  const pictures: number = scenario.toc.blockOffset[Zone.picture] * BLOCK_SIZE;
  const pictureBytes: number = 2 * BLOCK_SIZE * Math.ceil(scenario.recordCount(Zone.picture) / 2);

  disk.fill(PICTURE_PATTERN, start + pictures, start + pictures + pictureBytes);

  // The chest gets its own, so a test can tell the chest screen from the treasure screen that
  // replaces it. The records are 512 bytes and sit two to a pair of blocks, so this is where
  // GETREC( ZSPCCHRS, 18, 512) lands.
  const chest: number = start + pictures + (BLOCK_SIZE * CHEST_PICTURE);

  disk.fill(CHEST_PATTERN, chest, chest + BLOCK_SIZE);

  // Every level needs the three bands a wandering monster is rolled out of, because the roll is
  // RANDOM MOD the band's range and a range of nothing is a division by zero. One monster, with no
  // chance of anything worse, so a test knows what turned up.
  for (let level: number = 0; level < scenario.recordCount(Zone.maze); level++) {
    const record: IMaze = scenario.read(Zone.maze, level, maze);

    record.encounterTable = record.encounterTable.map(
      (): IMaze['encounterTable'][number] => ({
        weakest: 0,
        worseMultiplier: 0,
        worseStep: 0,
        range: 1,
        worsePercent: 0,
      }));
    scenario.write(Zone.maze, level, maze, record);
  }
}


/**
 * What a fight pays out. Reward 0 is gold and nothing else; reward 1 has a chest on it with nothing
 * on the chest; reward 2's chest carries a poison needle, and reward 3's an alarm. Reward 4 pays an
 * item rather than gold.
 *
 * The gold entry is rolled as CALCULAT( TRIES, AVEAMT, MINADD) - so many rolls of so many sides plus
 * a fixed amount - then multiplied by MULTX and by a second roll of the same shape, which is why the
 * second roll here is one of a one-sided die: it leaves the first roll as it stands.
 */
export function stockTheRewards(disk: Uint8Array): void {
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;
  const scenario: ScenarioDisk =
    new ScenarioDisk(disk.subarray(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE)));

  const chests: readonly { readonly chest: boolean; readonly trap: number }[] = [
    { chest: false, trap: -1 },
    { chest: true, trap: -1 },
    { chest: true, trap: POISON_NEEDLE_TRAP },
    { chest: true, trap: ALARM_TRAP },
  ];

  for (let index: number = 0; index < scenario.recordCount(Zone.reward); index++) {
    const record: IReward = reward.read(new Uint8Array(reward.size), 0);
    const chest: { readonly chest: boolean; readonly trap: number } | undefined = chests[index];

    record.hasChest = chest?.chest ?? false;

    if ((chest != null) && (chest.trap >= 0)) {
      record.trapKinds[chest.trap] = 1;
    }

    record.entryCount = 1;
    record.entries[0].chance = 100;
    record.entries[0].isItem = (index === ITEM_REWARD) ? 1 : 0;

    if (record.entries[0].isItem === 0) {
      // TRIES, AVEAMT, MINADD, MULTX, TRIES2, AVEAMT2, MINADD2.
      record.entries[0].calculation = [ 1, 10, 0, 1, 1, 1, 0 ];
    } else {
      // MININDX, MFACTOR, MAXTIMES, RANGE, PERCBIGR and two words nothing reads.
      record.entries[0].calculation = [ 0, 1, 0, 1, 0, 0, 0 ];
    }

    scenario.write(Zone.reward, index, reward, record);
  }
}


/**
 * What each level costs. The real table is per class and rises steeply; this is the same shape with
 * round numbers, and element nought is what every level past the twelfth costs on top of it.
 */
export function writeExperienceTable(disk: Uint8Array): void {
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;
  const scenario: ScenarioDisk =
    new ScenarioDisk(disk.subarray(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE)));
  const table: IExperienceTable = experienceTable.read(new Uint8Array(experienceTable.size), 0);

  for (const row of table) {
    row.forEach((level: IWizardryLong, index: number): void => {
      level.low = 1000 * ((index === 0) ? 13 : index);
    });
  }

  scenario.write(Zone.experience, 0, experienceTable, table);
}


/** A disk that passes every check, unless `spoil` breaks something on purpose. */
export function buildScenarioDisk(gameName: string = 'A TEST SCENARIO',
                                  spoil?: (disk: Uint8Array, toc: number) => void): Uint8Array {
  const disk: Uint8Array = buildDisk('WSTEST', [
    { name: 'WIZARDRY.CODE', firstBlock: 0, blockCount: SCENARIO_FIRST_BLOCK },
    { name: 'SCENARIO.DATA', firstBlock: SCENARIO_FIRST_BLOCK, blockCount: SCENARIO_BLOCKS },
    { name: 'SCENARIO.MESGS',
      firstBlock: SCENARIO_FIRST_BLOCK + SCENARIO_BLOCKS,
      blockCount: MESSAGE_BLOCKS },
  ]);

  writeTableOfContents(disk, gameName);
  writeFonts(disk);
  writeSpellBooks(disk);
  disk.set(messageFileBytes(), (SCENARIO_FIRST_BLOCK + SCENARIO_BLOCKS) * BLOCK_SIZE);
  stockTheShop(disk);
  stockTheBestiary(disk);
  stockTheRewards(disk);
  writeExperienceTable(disk);
  spoil?.(disk, SCENARIO_FIRST_BLOCK * BLOCK_SIZE);

  return disk;
}
