import { describe, expect, it } from 'vitest';

import { MAZE_SIZE, SQUARE_KINDS_PER_MAZE, SquareKind, Wall } from '../data/layout/wiz-types';
import { HiresScreen } from '../runtime/hires-screen';
import { Random } from '../runtime/random';
import type { IMazeLevel } from './runner';
import { drawmaze } from './runner';
import type { IGlobals } from './wiz';
import { newglobals } from './wiz';


/** Counts how far the generator is drawn on, which is what the original's evaluation order fixes. */
class CountingRandom extends Random {
  public draws: number = 0;

  public override modulo(limit: number): number {
    this.draws = this.draws + 1;

    return super.modulo(limit);
  }
}


function filledGrid(value: number): number[][] {
  return Array.from({ length: MAZE_SIZE }, (): number[] => new Array<number>(MAZE_SIZE).fill(value));
}


/** One square, walled on the left and right, with the given wall straight ahead. */
function oneSquare(ahead: Wall, sides: Wall = Wall.wall): IMazeLevel {
  const westWalls: number[][] = filledGrid(Wall.open);
  const eastWalls: number[][] = filledGrid(Wall.open);
  const northWalls: number[][] = filledGrid(Wall.open);

  westWalls[0][0] = sides;
  eastWalls[0][0] = sides;
  northWalls[0][0] = ahead;

  return {
    westWalls,
    eastWalls,
    northWalls,
    southWalls: filledGrid(Wall.open),
    squareTag: filledGrid(0),
    squareKind: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(SquareKind.normal),
    argument0: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(0),
    argument1: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(0),
    argument2: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(0),
  };
}


function standing(light: number): IGlobals {
  return { ...newglobals(), light };
}


describe('drawmaze and the random generator', (): void => {
  // The original wrote the secret-door test as one boolean expression, and UCSD Pascal evaluated
  // every operand of it, so a number was drawn for each of the three walls of a square whatever
  // those walls were. Anything less leaves the generator out of step with the original.

  it('draws once for each of the three walls of a plain square', (): void => {
    const random: CountingRandom = new CountingRandom(1);

    drawmaze(new HiresScreen(), oneSquare(Wall.wall), standing(2), random);

    expect(random.draws).toBe(3);
  });

  it('draws for a plain wall, which can never show a door', (): void => {
    const random: CountingRandom = new CountingRandom(1);

    drawmaze(new HiresScreen(), oneSquare(Wall.wall, Wall.open), standing(2), random);

    expect(random.draws).toBe(1);
  });

  it('draws for a hidden door even when light makes the answer certain', (): void => {
    const random: CountingRandom = new CountingRandom(1);

    drawmaze(new HiresScreen(), oneSquare(Wall.hiddenDoor, Wall.open), standing(2), random);

    expect(random.draws).toBe(1);
  });

  it('draws the same number of times whether or not there is light', (): void => {
    const lit: CountingRandom = new CountingRandom(1);
    const dark: CountingRandom = new CountingRandom(1);

    drawmaze(new HiresScreen(), oneSquare(Wall.hiddenDoor), standing(2), lit);
    drawmaze(new HiresScreen(), oneSquare(Wall.hiddenDoor), standing(0), dark);

    expect(dark.draws).toBe(lit.draws);
  });
});


describe('drawmaze doors', (): void => {
  function litPixels(level: IMazeLevel, light: number, seed: number): number {
    const screen: HiresScreen = new HiresScreen();

    drawmaze(screen, level, standing(light), new Random(seed));

    return screen.toAscii(4, 5, 82, 79).join('').split('').filter((pixel: string): boolean => pixel === '#').length;
  }

  it('draws a door in a plain doorway', (): void => {
    expect(litPixels(oneSquare(Wall.door), 2, 1)).toBeGreaterThan(litPixels(oneSquare(Wall.wall), 2, 1));
  });

  it('shows a hidden door to someone carrying light', (): void => {
    expect(litPixels(oneSquare(Wall.hiddenDoor), 2, 1)).toBe(litPixels(oneSquare(Wall.door), 2, 1));
  });

  it('hides it from someone without light, most of the time', (): void => {
    expect(litPixels(oneSquare(Wall.hiddenDoor), 0, 1)).toBe(litPixels(oneSquare(Wall.wall), 0, 1));
  });
});


describe('drawmaze and light', (): void => {
  it('spends a turn of light each time it draws', (): void => {
    const g: IGlobals = standing(5);

    drawmaze(new HiresScreen(), oneSquare(Wall.wall), g, new Random(1));

    expect(g.light).toBe(4);
  });

  it('spends none when there is none to spend', (): void => {
    const g: IGlobals = standing(0);

    drawmaze(new HiresScreen(), oneSquare(Wall.wall), g, new Random(1));

    expect(g.light).toBe(0);
  });
});
