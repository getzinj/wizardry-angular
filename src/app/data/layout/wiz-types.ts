import type { ILayout, IRecordLayout } from './ucsd-layout';
import { array, boolean, integer, packedArray, packedGrid, record, string, wizardryLong, word } from './ucsd-layout';

// The record shapes the game stores on its scenario disk, described with the layout rules in
// ucsd-layout.ts. Field names and order follow the original declarations, so the computed sizes
// can be checked against the ones the disk's own table of contents implies.

export enum Race { none, human, elf, dwarf, gnome, hobbit }

export enum CharacterClass { fighter, mage, priest, thief, bishop, samurai, lord, ninja }

export enum Alignment { unaligned, good, neutral, evil }

export enum Status { ok, afraid, asleep, paralysed, stoned, dead, ashes, lost }

/** What stands on one side of a maze square. A hidden door looks like a wall until it is found. */
export enum Wall { open, wall, door, hiddenDoor }

/** What a maze square does when stepped on. */
export enum SquareKind {
  normal, stairs, pit, chute, spinner, dark, transfer,
  ouch, buttons, rockWater, fizzle, message, encounter,
}

/** The regions of the scenario file. Each is a run of blocks holding records of one kind. */
export enum Zone { toc, maze, monster, reward, object, character, picture, experience }

export const ZONE_COUNT: number = 8;

/** Squares along each side of a maze level. */
export const MAZE_SIZE: number = 20;

/** Distinct square behaviours a level can define, indexed by a square's four-bit tag. */
export const SQUARE_KINDS_PER_MAZE: number = 16;

/** Characters the roster holds. */
export const ROSTER_SIZE: number = 20;

/** Characters in a party. */
export const PARTY_SIZE: number = 6;


/**
 * A damage roll: so many dice of so many sides, plus a fixed amount.
 *
 * THPREC in the original, where the dice count is declared LEVEL, because a monster's hit points
 * are rolled one die per level and the same field is what combat reads when it wants the monster's
 * level - ten per cent a level to resist a spell, and so on.
 */
export const hitPointRoll = record({
  diceCount: integer(),
  diceSides: integer(),
  bonus: integer(),
});


export type IHitPointRoll = ReturnType<typeof hitPointRoll.read>;


/** One item a character is carrying. */
export const possession = record({
  equipped: boolean(),
  cursed: boolean(),
  identified: boolean(),
  objectIndex: integer(),
});


/** Zone 0 record 0: names the scenario and says where everything else on the disk lives. */
export const scenarioToc = record({
  gameName: string(40),

  /** Records packed into each pair of blocks, per zone. Indexing depends on this. */
  recordsPerBlockPair: array(ZONE_COUNT, integer()),

  /** Records the zone actually holds, per zone. */
  recordsOnDisk: array(ZONE_COUNT, integer()),

  /** Blocks each zone spans. The original declares this unused, but the disk fills it in. */
  blocksPerZone: array(ZONE_COUNT, integer()),

  /** First block of each zone, counted from the start of the scenario file. */
  blockOffset: array(ZONE_COUNT, integer()),

  raceNames: array(6, string(9)),
  classNames: array(8, string(9)),
  statusNames: array(8, string(8)),
  alignmentNames: array(4, string(9)),

  /** Each spell's name reduced to a number, which is how spell names are recognised when typed. */
  spellHash: array(51, integer()),
  spellGroup: packedArray(51, 3),
  spellTarget: packedArray(51, 2),
});


/** One level of the maze. */
export const maze = record({
  westWalls: packedGrid(MAZE_SIZE, MAZE_SIZE, 2),
  southWalls: packedGrid(MAZE_SIZE, MAZE_SIZE, 2),
  eastWalls: packedGrid(MAZE_SIZE, MAZE_SIZE, 2),
  northWalls: packedGrid(MAZE_SIZE, MAZE_SIZE, 2),

  /** Squares where a fixed encounter waits. */
  fights: packedGrid(MAZE_SIZE, MAZE_SIZE, 1),

  /** Each square's tag, selecting one of the behaviours below. */
  squareTag: packedGrid(MAZE_SIZE, MAZE_SIZE, 4),

  squareKind: packedArray(SQUARE_KINDS_PER_MAZE, 4),

  /** Three arguments per behaviour: a destination, a message number, a monster, and so on. */
  argument0: array(SQUARE_KINDS_PER_MAZE, integer()),
  argument1: array(SQUARE_KINDS_PER_MAZE, integer()),
  argument2: array(SQUARE_KINDS_PER_MAZE, integer()),

  /** How wandering monsters are rolled, in three bands of increasing nastiness. */
  encounterTable: array(3, record({
    weakest: integer(),
    worseMultiplier: integer(),
    worseStep: integer(),
    range: integer(),
    worsePercent: integer(),
  })),
});


export const character = record({
  name: string(15),
  password: string(15),

  /** Set while the character is out in the maze, which stops two parties taking the same one. */
  inMaze: boolean(),

  race: word(),
  characterClass: word(),
  age: integer(),
  status: word(),
  alignment: word(),

  /** Strength, intelligence, piety, vitality, agility and luck. */
  attributes: packedArray(6, 5),

  /** Thief skills, and the luck that resists item breakage. */
  skills: packedArray(5, 5),

  gold: wizardryLong(),

  possessions: record({
    count: integer(),
    items: array(8, possession),
  }),

  experience: wizardryLong(),
  /** MAXLEVAC: the highest level this character has reached, which draining cannot take away. */
  maximumLevel: integer(),
  level: integer(),
  hitPoints: integer(),
  maximumHitPoints: integer(),
  /**
   * One bit per spell. The original declares PACKED ARRAY[ 0..49], but range checking is off and
   * the seventh priest group is spells 49 and 50, so the game reads, sets and clears bit 50 as
   * well - MINSPCNT( PRIESTSP, 7, 49, 50) and TRY2LRN( 49, 50) in CASTLE2.TEXT.txt, and HAMMANGL's
   * FOR SPELLI := 1 TO 50 in COMBAT4.TEXT.txt. The bit is inside the field either way, because
   * fifty bits and fifty-one both round up to four words, so this is the array the game has.
   */
  spellsKnown: packedArray(51, 1),
  mageSpellSlots: array(7, integer()),
  priestSpellSlots: array(7, integer()),
  hitPointsMethod: integer(),
  armourClass: integer(),
  healingPerTurn: integer(),
  criticalHits: boolean(),
  swings: integer(),
  damage: hitPointRoll,
  bonusVersusType2: packedGrid(2, 14, 1),
  bonusVersusType3: packedGrid(2, 7, 1),
  bonusVersusType: packedArray(14, 1),

  /**
   * Four words the original reads three different ways: where a character was left in the maze,
   * how badly poisoned they are, and which honours they have been awarded. The same bytes carry
   * whichever meaning the situation calls for.
   */
  lostLocation: array(4, integer()),
});


export type ICharacter = ReturnType<typeof character.read>;

export type IMaze = ReturnType<typeof maze.read>;

export type IMonster = ReturnType<typeof monster.read>;

export type IObject = ReturnType<typeof object.read>;

export type IReward = ReturnType<typeof reward.read>;

export type IRewardEntry = ReturnType<typeof rewardEntry.read>;

export type IScenarioToc = ReturnType<typeof scenarioToc.read>;


export const object = record({
  name: string(15),
  unidentifiedName: string(15),
  objectType: word(),
  alignment: word(),
  cursed: boolean(),
  special: integer(),
  changesTo: integer(),
  changeChance: integer(),
  price: wizardryLong(),
  stock: integer(),
  spellPower: integer(),
  usableByClass: packedArray(8, 1),
  healingPerTurn: integer(),
  bonusVersusType2: packedArray(16, 1),
  bonusVersusType3: packedArray(16, 1),
  armourModifier: integer(),
  hitModifier: integer(),
  damage: hitPointRoll,
  extraSwings: integer(),
  criticalHits: boolean(),
  bonusVersusType: packedArray(14, 1),
});


/**
 * One of a reward's nine entries: how likely it is, and then either gold or an item.
 *
 * REWDCALC is a variant record the original reads two ways - seven words that are either the gold
 * calculation (TRIES, AVEAMT, MINADD, MULTX, TRIES2, AVEAMT2, MINADD2) or the item one (MININDX,
 * MFACTOR, MAXTIMES, RANGE, PERCBIGR and two words nothing reads). Which it is depends on BITEM,
 * so the words are kept as they lie and the port names them at the two places that read them.
 */
export const rewardEntry = record({
  chance: integer(),
  isItem: integer(),
  calculation: array(7, integer()),
});


/** What is found after a fight: whether there is a chest, what it is trapped with, and the spoils. */
export const reward = record({
  hasChest: boolean(),
  trapKinds: packedArray(8, 1),
  entryCount: integer(),
  entries: array(9, rewardEntry),
});


export const monster = record({
  unidentifiedName: string(15),
  unidentifiedPlural: string(15),
  name: string(15),
  plural: string(15),

  /** Which stored picture to show. */
  picture: integer(),

  /**
   * CALC1: how many of them turn up, rolled like hit points. It is declared TWIZLONG and passed
   * where a THPREC is wanted - both are three words, so LOW is the dice count, MID the range and
   * HIGH the minimum. This is its only use in the game.
   */
  groupRoll: wizardryLong(),
  hitPoints: hitPointRoll,
  monsterClass: integer(),
  armourClass: integer(),
  attackCount: integer(),
  attacks: array(7, hitPointRoll),
  experience: wizardryLong(),
  levelDrain: integer(),
  healingPerTurn: integer(),
  reward1: integer(),
  reward2: integer(),

  /** Which other monster it calls for help, and how often. */
  friends: integer(),
  friendsPercent: integer(),

  mageSpellLevel: integer(),
  priestSpellLevel: integer(),

  /** How many are left, for the ones there is only ever one of. */
  unique: integer(),

  breathes: integer(),
  resistances: integer(),
  weakVersusType3: packedArray(16, 1),
  properties: packedArray(16, 1),
});


/**
 * Experience needed for each level, for each class. Element 0 of a class's row is not a level:
 * it is what each level past the twelfth costs on top of the twelfth.
 */
export const experienceTable = array(8, array(13, wizardryLong()));

export type IExperienceTable = ReturnType<typeof experienceTable.read>;


/** Every zone's record layout, so a size can be checked against what the disk says it should be. */
export const ZONE_LAYOUTS: Readonly<Partial<Record<Zone, IRecordLayout<never> | ILayout<unknown>>>> = {
  [Zone.toc]: scenarioToc,
  [Zone.maze]: maze,
  [Zone.monster]: monster,
  [Zone.reward]: reward,
  [Zone.object]: object,
  [Zone.character]: character,
  [Zone.experience]: experienceTable,
};
