import { CLRPICT_CLEAR, PICTURE_CLIP_BOTTOM, PICTURE_RIGHT } from '../runtime/apple-hires.constants';
import type { HiresScreen } from '../runtime/hires-screen';
import type { Random } from '../runtime/random';
import { MAZE_SIZE, Wall, SquareKind } from '../data/layout/wiz-types';
import type { IGlobals } from './wiz';
import { Direction } from './wiz';

// The first-person view of the maze, from RUNNER.TEXT.txt (DRAWMAZE and the procedures nested in
// it: SHFTPOS, FRWDVIEW, LEFTVIEW, RIGHVIEW, DRAWLEFT, DRAWRIGH, DRAWFRNT).
//
// There is no depth buffer and no sorting. The view is drawn from the nearest square outwards, and
// each square narrows a clip window to the opening it leaves, so a square further away can only
// draw through the gap in front of it. Walls are aimed at the corners of the window and simply cut
// off, which is what gives the near ones their splayed edges.

/** The fields of a maze level the view needs. */
export interface IMazeLevel {
  readonly westWalls: readonly (readonly number[])[];
  readonly southWalls: readonly (readonly number[])[];
  readonly eastWalls: readonly (readonly number[])[];
  readonly northWalls: readonly (readonly number[])[];
  readonly squareTag: readonly (readonly number[])[];
  readonly squareKind: readonly number[];
  readonly argument0: readonly number[];
  readonly argument1: readonly number[];
  readonly argument2: readonly number[];
}


export interface IPosition {
  readonly x: number;
  readonly y: number;
}


interface IWallGeometry {
  /** Near bound of the box standing for this square: the upper-left of its opening. */
  readonly nearEdge: number;

  /** Far bound: the lower-right of that opening. */
  readonly farEdge: number;

  readonly wallWidth: number;
  readonly wallHeight: number;
  readonly doorWidth: number;
  readonly doorFrame: number;
}


/** Squares visible by lamplight, and without it. */
const LIT_DISTANCE: number = 5;
const LIT_DISTANCE_QUICK_PLOT: number = 3;
const UNLIT_DISTANCE: number = 2;

/** One chance in this many that a hidden door shows itself when you have no light. */
const HIDDEN_DOOR_GLIMPSE: number = 6;
const HIDDEN_DOOR_GLIMPSE_ROLL: number = 3;


function wrap(value: number): number {
  return ((value % MAZE_SIZE) + MAZE_SIZE) % MAZE_SIZE;
}


/**
 * Moves a position by so many squares to the right and so many ahead, relative to the way the
 * party is facing, wrapping at the edges: every level joins up with itself.
 */
export function shftpos(from: IPosition, facing: Direction, rightward: number, forward: number): IPosition {
  switch (facing) {
    case Direction.north:
      return { x: wrap(from.x + rightward), y: wrap(from.y + forward) };
    case Direction.east:
      return { x: wrap(from.x + forward), y: wrap(from.y - rightward) };
    case Direction.south:
      return { x: wrap(from.x - rightward), y: wrap(from.y - forward) };
    default:
      return { x: wrap(from.x - forward), y: wrap(from.y + rightward) };
  }
}


/** What stands on the far side of a square, in the direction being walked. */
export function frwdview(level: IMazeLevel, at: IPosition, facing: Direction, rightward: number): Wall {
  const square: IPosition = shftpos(at, facing, rightward, 0);

  switch (facing) {
    case Direction.north: return level.northWalls[square.x][square.y];
    case Direction.east: return level.eastWalls[square.x][square.y];
    case Direction.south: return level.southWalls[square.x][square.y];
    default: return level.westWalls[square.x][square.y];
  }
}


function leftview(level: IMazeLevel, at: IPosition, facing: Direction, rightward: number): Wall {
  const square: IPosition = shftpos(at, facing, rightward, 0);

  switch (facing) {
    case Direction.north: return level.westWalls[square.x][square.y];
    case Direction.east: return level.northWalls[square.x][square.y];
    case Direction.south: return level.eastWalls[square.x][square.y];
    default: return level.southWalls[square.x][square.y];
  }
}


function righview(level: IMazeLevel, at: IPosition, facing: Direction, rightward: number): Wall {
  const square: IPosition = shftpos(at, facing, rightward, 0);

  switch (facing) {
    case Direction.north: return level.eastWalls[square.x][square.y];
    case Direction.east: return level.southWalls[square.x][square.y];
    case Direction.south: return level.westWalls[square.x][square.y];
    default: return level.northWalls[square.x][square.y];
  }
}


/** The nearest square: a box inset eight pixels in the 82 by 79 picture window. */
function nearestGeometry(): IWallGeometry {
  return { nearEdge: 8, farEdge: 72, wallWidth: 32, wallHeight: 64, doorWidth: 16, doorFrame: 8 };
}


/** One square further away: everything halves and the opening closes in on the centre. */
function deeperGeometry(near: IWallGeometry): IWallGeometry {
  const wallWidth: number = Math.floor(near.wallWidth / 2);

  return {
    nearEdge: near.nearEdge + wallWidth,
    farEdge: near.farEdge - wallWidth,
    wallWidth,
    wallHeight: wallWidth * 2,
    doorWidth: Math.floor(wallWidth / 2),
    doorFrame: Math.floor(wallWidth / 4),
  };
}


/**
 * Whether a doorway should be drawn in a wall. Plain walls and openings have none; a hidden one is
 * drawn only if you are carrying light, or on the occasional glimpse that gives it away.
 *
 * The draw is taken first, and always, even where the answer cannot depend on it. That is not
 * tidiness sacrificed: the original wrote this as one boolean expression, and UCSD Pascal
 * evaluated every operand of AND and OR rather than stopping early, so a random number was
 * consumed on every wall of every square in view. Skipping it where it cannot matter would leave
 * the generator a different distance along, and everything downstream of it reading different
 * numbers.
 */
function showsDoor(wall: Wall, hasLight: boolean, random: Random): boolean {
  const glimpsed: boolean = random.modulo(HIDDEN_DOOR_GLIMPSE) !== HIDDEN_DOOR_GLIMPSE_ROLL;
  const stayedHidden: boolean = (wall === Wall.hiddenDoor) && !hasLight && glimpsed;

  return !((wall === Wall.open) || (wall === Wall.wall) || stayedHidden);
}


function drawleft(screen: HiresScreen, g: IWallGeometry, wall: Wall, hasLight: boolean, random: Random): void {
  screen.drawline(g.nearEdge, g.nearEdge, -1, -1, g.wallWidth);
  screen.drawline(g.nearEdge, g.nearEdge, 0, 1, g.wallHeight);
  screen.drawline(g.nearEdge, g.farEdge, -1, 1, g.wallWidth);
  screen.drawline(g.nearEdge - g.wallWidth, g.nearEdge - g.wallWidth, 0, 1, g.wallHeight * 2);

  if (showsDoor(wall, hasLight, random)) {
    screen.drawline(g.nearEdge - g.doorFrame, g.nearEdge, -1, -1, g.doorWidth);
    screen.drawline(g.nearEdge - g.doorFrame, g.nearEdge, 0, 1, g.wallHeight + g.doorFrame);
    screen.drawline(g.nearEdge - g.doorFrame - g.doorWidth, g.nearEdge - g.doorWidth, 0, 1,
                    g.wallHeight + g.wallWidth + g.doorFrame);
  }
}


function drawrigh(screen: HiresScreen, g: IWallGeometry, wall: Wall, hasLight: boolean, random: Random): void {
  screen.drawline(g.farEdge, g.nearEdge, 1, -1, g.wallWidth);
  screen.drawline(g.farEdge, g.nearEdge, 0, 1, g.wallHeight);
  screen.drawline(g.farEdge, g.farEdge, 1, 1, g.wallWidth);
  screen.drawline(g.farEdge + g.wallWidth, g.nearEdge - g.wallWidth, 0, 1, g.wallHeight * 2);

  if (showsDoor(wall, hasLight, random)) {
    screen.drawline(g.farEdge + g.doorFrame, g.nearEdge, 1, -1, g.doorWidth);
    screen.drawline(g.farEdge + g.doorFrame, g.nearEdge, 0, 1, g.wallHeight + g.doorFrame);
    screen.drawline(g.farEdge + g.doorFrame + g.doorWidth, g.nearEdge - g.doorWidth, 0, 1,
                    g.wallHeight + g.wallWidth + g.doorFrame);
  }
}


/** A wall square-on to the viewer, offset sideways to stand ahead, to the left or to the right. */
function drawfrnt(screen: HiresScreen, g: IWallGeometry, wall: Wall, sideways: number,
                  hasLight: boolean, random: Random): void {
  const left: number = g.nearEdge + sideways;

  screen.drawline(left, g.nearEdge, 1, 0, g.wallHeight);
  screen.drawline(left, g.nearEdge, 0, 1, g.wallHeight);
  screen.drawline(left + g.wallHeight, g.nearEdge, 0, 1, g.wallHeight + 1);
  screen.drawline(left, g.nearEdge + g.wallHeight, 1, 0, g.wallHeight);

  if (showsDoor(wall, hasLight, random)) {
    const reach: number = g.wallWidth + g.doorWidth + g.doorFrame;

    screen.drawline(left + g.doorFrame, g.farEdge, 0, -1, reach);
    screen.drawline(left + g.wallWidth + g.doorWidth + g.doorFrame, g.farEdge, 0, -1, reach);
    screen.drawline(left + g.doorFrame, g.farEdge - reach, 1, 0, g.wallWidth + g.doorWidth + 1);
  }
}


/**
 * Draws what the party can see from where it stands. Each pass draws one square's walls, narrows
 * the clip window to what that square leaves open, and steps forward, until the view is blocked or
 * the light runs out.
 */
export function drawmaze(screen: HiresScreen, level: IMazeLevel, g: IGlobals,
                         random: Random, quickPlot: boolean = false): void {
  const hasLight: boolean = g.light > 0;
  let remaining: number = UNLIT_DISTANCE;

  if (hasLight) {
    remaining = quickPlot ? LIT_DISTANCE_QUICK_PLOT : LIT_DISTANCE;
    g.light = g.light - 1;
  }

  let geometry: IWallGeometry = nearestGeometry();
  let at: IPosition = { x: g.mazex, y: g.mazey };
  let clipLeft: number = 0;
  let clipRight: number = PICTURE_RIGHT;

  screen.clrpict(0, 0, 0, CLRPICT_CLEAR);

  while (remaining > 0) {
    const tag: number = level.squareTag[at.x][at.y];
    const kind: SquareKind = level.squareKind[tag];

    if (kind === SquareKind.dark) {
      // A dark square shows nothing at all, however much light you are carrying.
      return;
    }

    if ((kind === SquareKind.transfer) && (level.argument0[tag] === g.mazelev)) {
      // A square that quietly stands in for one elsewhere on the same level, so the view carries
      // on from there without the party appearing to move.
      at = { x: level.argument2[tag], y: level.argument1[tag] };
    }

    screen.clrpict(clipLeft, 0, clipRight, PICTURE_CLIP_BOTTOM);

    const onLeft: Wall = leftview(level, at, g.directio, 0);

    if (onLeft !== Wall.open) {
      drawleft(screen, geometry, onLeft, hasLight, random);
      clipLeft = geometry.nearEdge;
    } else {
      // Nothing beside us, so we see into the square to our left; what shows is its far wall.
      const beyond: Wall = frwdview(level, at, g.directio, -1);

      if (beyond !== Wall.open) {
        drawfrnt(screen, geometry, beyond, -(2 * geometry.wallWidth), hasLight, random);
        clipLeft = geometry.nearEdge;
      }
    }

    const onRight: Wall = righview(level, at, g.directio, 0);

    if (onRight !== Wall.open) {
      drawrigh(screen, geometry, onRight, hasLight, random);
      clipRight = geometry.farEdge;
    } else {
      const beyond: Wall = frwdview(level, at, g.directio, 1);

      if (beyond !== Wall.open) {
        drawfrnt(screen, geometry, beyond, 2 * geometry.wallWidth, hasLight, random);
        clipRight = geometry.farEdge;
      }
    }

    const ahead: Wall = frwdview(level, at, g.directio, 0);

    if (ahead !== Wall.open) {
      drawfrnt(screen, geometry, ahead, 0, hasLight, random);

      return;
    }

    geometry = deeperGeometry(geometry);
    at = shftpos(at, g.directio, 0, 1);
    remaining = remaining - 1;
  }
}
