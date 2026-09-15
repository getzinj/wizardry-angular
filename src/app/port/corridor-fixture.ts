// A hand-made corridor, which is what lets DRAWMAZE be tested without a scenario disk: walls that
// recede straight ahead for a known number of squares, so the geometry has something to prove.

import { MAZE_SIZE, SQUARE_KINDS_PER_MAZE, SquareKind, Wall } from '../data/layout/wiz-types';
import type { IMazeLevel } from './runner';


function filledGrid(value: number): number[][] {
  return Array.from({ length: MAZE_SIZE }, (): number[] => new Array<number>(MAZE_SIZE).fill(value));
}


/**
 * A level made up on the spot: one corridor running north from the corner, walled on both sides
 * and closed at the far end. It exists so the maze view can be seen working before a real scenario
 * is attached.
 */
export function buildCorridorLevel(depth: number): IMazeLevel {
  const westWalls: number[][] = filledGrid(Wall.open);
  const eastWalls: number[][] = filledGrid(Wall.open);
  const northWalls: number[][] = filledGrid(Wall.open);
  const southWalls: number[][] = filledGrid(Wall.open);
  const corridorColumn: number = 10;

  for (let y: number = 0; y < MAZE_SIZE; y++) {
    westWalls[corridorColumn][y] = Wall.wall;
    eastWalls[corridorColumn][y] = Wall.wall;
  }

  // A door part of the way along, to show that doors are drawn differently from plain walls.
  if (depth > 1) {
    eastWalls[corridorColumn][1] = Wall.door;
  }

  northWalls[corridorColumn][depth - 1] = Wall.wall;

  return {
    westWalls,
    eastWalls,
    northWalls,
    southWalls,
    squareTag: filledGrid(0),
    squareKind: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(SquareKind.normal),
    argument0: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(0),
    argument1: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(0),
    argument2: new Array<number>(SQUARE_KINDS_PER_MAZE).fill(0),
  };
}


/** Where the made-up corridor starts. */
export const CORRIDOR_START_X: number = 10;
export const CORRIDOR_START_Y: number = 0;
