// Wiz1A.DSK/WIZ.TEXT.txt - the main program: its constants, types and globals.
//
// The original declares these at program level and every segment reads and writes them directly,
// so the port keeps them in one place rather than threading them through hundreds of calls.
// Modules cannot rebind an imported name, hence one object rather than a set of exported
// variables. Names are the original's, lowercased: Pascal did not care about case and TypeScript
// does, so each identifier gets one spelling and keeps it.

import { MAZE_SIZE, character, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter, IScenarioToc } from '../data/layout/wiz-types';
import type { IWizardryLong } from '../data/layout/ucsd-layout';

export const BLOCKSZ: number = 512;
export const DRIVE1: number = 4;
export const CRETURN: number = 13;

/** Characters in a party, and the length of CHARACTR and CHARDISK. */
export const PARTY_MAXIMUM: number = 6;


/**
 * TXGOTO. Where the mainline should go next; a segment sets it and returns, and the trampoline
 * calls whichever segment owns that destination. The ordinal order is the declared order and
 * matters, because BASE12 reads the same word as either a strength or one of these.
 */
export enum Xgoto {
  xdone, xtrainin, xcastle, xgilgams, xinspect, xboltac,
  xcant, xrunner, xcombat, xnewmaze, xchk4win, xreward,
  xinspct2, xequip6, xeqpdsp, xreorder, xcemetry, xinspct3,
  xbck2cmp, xbck2rol, xcmp2eq6, xunused, xreward2, xscnmsg,
  xcampstf, xedgtown, xinsarea, xbk2cmp2,
}


export enum Trace { norace, human, elf, dwarf, gnome, hobbit }

export enum Tclass { fighter, mage, priest, thief, bishop, samurai, lord, ninja }

export enum Talign { unalign, good, neutral, evil }

export enum Tstatus { ok, afraid, asleep, plyze, stoned, dead, ashes, lost }

export enum Tattrib { strength, iq, piety, vitality, agility, luck }

export enum Tobjtype { weapon, armor, shield, helmet, gauntlet, special, misc }

/** TSPEL012. What a spell has to be aimed at: nothing, one of the party, or a group. */
export enum Tspel012 { generic, person, group }

// TZSCN lives in the data layer as Zone, with the same ordinals; one enum, one spelling.


/**
 * TSPELL7G is ARRAY[ 1..7] OF INTEGER, so the game's group numbers run from one. The record
 * layout reads it as an ordinary array, whose first element is at index zero; these keep the
 * game's numbering at the call sites rather than scattering the offset through them.
 */
export function spelgrp(slots: readonly number[], group: number): number {
  return slots[group - 1];
}


export function setspelgrp(slots: number[], group: number, value: number): void {
  slots[group - 1] = value;
}

export enum Direction { north, east, south, west }


export type ITwizlong = IWizardryLong;


export interface IGlobals {
  partycnt: number;

  /** The scratch integer the original reuses everywhere; kept because procedures leave it set. */
  llbase04: number;

  /** How long PAUSE1 waits, set by the maze's T)ime command. */
  timedlay: number;

  inchar: string;

  xgoto: Xgoto;

  /** Where CASTLE should return to; also how BOLTAC and CANT know who sent them. */
  xgoto2: Xgoto;

  attk012: number;
  fizzles: number;

  /**
   * BASE12, one word the original reads two ways through a variant record: combat adds the party's
   * levels up in it to decide whether monsters are afraid of them, and camp leaves the destination
   * UTILITIE3 should come back to there. The two never overlap, which is why they share the word.
   */
  base12: number;

  chstalrm: number;
  acmod2: number;
  enstreng: number;

  /** Where the party is standing, in squares, and which way it faces. */
  mazex: number;
  mazey: number;

  /** Which level, counting down from 1. Zero means climbing out; below zero, about to go in. */
  mazelev: number;

  directio: Direction;

  savelev: number;
  savex: number;
  savey: number;

  /**
   * Which squares of the level the party has already been through, so a wandering monster is more
   * likely where they have walked. NEWMAZE floods it from nine random spots and from every fixed
   * encounter; walking into a room clears that room again.
   */
  fightmap: boolean[][];

  /** Whether the encounter began before the party could run, and which monster it is. */
  encb4run: boolean;
  enemyinx: number;

  /**
   * Turns of light left. It runs down as the maze is drawn, and how far you can see depends on
   * whether any is left.
   */
  light: number;

  /** The party, and which roster slot each of them came from. */
  charactr: ICharacter[];
  chardisk: number[];

  /** The scenario's table of contents, re-read whenever a segment has written to the disk. */
  scntoc: IScenarioToc;
}


/** A record of zeroes, which is what FILLCHAR leaves behind and what an empty global starts as. */
export function blankchar(): ICharacter {
  return character.read(new Uint8Array(character.size), 0);
}


function blanktoc(): IScenarioToc {
  return scenarioToc.read(new Uint8Array(scenarioToc.size), 0);
}


/** FIGHTMAP, a square per maze square, all clear. */
export function blankmap(): boolean[][] {
  return Array.from({ length: MAZE_SIZE },
                    (): boolean[] => new Array<boolean>(MAZE_SIZE).fill(false));
}


/** Every global as a fresh boot leaves it. */
export function newglobals(): IGlobals {
  return {
    partycnt: 0,
    llbase04: 0,
    timedlay: 0,
    inchar: '\x00',
    xgoto: Xgoto.xcastle,
    xgoto2: Xgoto.xgilgams,
    attk012: 0,
    fizzles: 0,
    base12: 0,
    chstalrm: 0,
    acmod2: 0,
    enstreng: 0,
    mazex: 0,
    mazey: 0,
    mazelev: 1,
    directio: Direction.north,
    savelev: 0,
    savex: 0,
    savey: 0,
    fightmap: blankmap(),
    encb4run: false,
    enemyinx: 0,
    light: 0,
    charactr: Array.from({ length: PARTY_MAXIMUM }, blankchar),
    chardisk: new Array<number>(PARTY_MAXIMUM).fill(0),
    scntoc: blanktoc(),
  };
}


export const g: IGlobals = newglobals();


/** Puts every global back to where a fresh boot would leave it, for tests and for a new game. */
export function resetglobals(): void {
  Object.assign(g, newglobals());
}
