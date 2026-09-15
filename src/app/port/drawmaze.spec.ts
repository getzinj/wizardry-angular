import { describe, expect, it } from 'vitest';

import { PICTURE_LEFT_PIXEL, PICTURE_RIGHT, PICTURE_TOP_ROW } from '../runtime/apple-hires.constants';
import { HiresScreen } from '../runtime/hires-screen';
import { Direction, g } from './wiz';
import { Random } from '../runtime/random';
import { drawmaze } from './runner';
import { CORRIDOR_START_X, CORRIDOR_START_Y, buildCorridorLevel } from './corridor-fixture';


function drawDemoCorridor(screen: HiresScreen, depth: number): void {
  g.mazex = CORRIDOR_START_X;
  g.mazey = CORRIDOR_START_Y;
  g.mazelev = 1;
  g.directio = Direction.north;
  g.light = 10;

  drawmaze(screen, buildCorridorLevel(depth), g, new Random(1));
}

/** Screen pixel just past the right edge of the picture window. */
const FIRST_PIXEL_RIGHT_OF_PICTURE: number = PICTURE_LEFT_PIXEL + PICTURE_RIGHT + 1;


function litPixelCount(rows: string[]): number {
  return rows.join('').split('').filter((pixel: string): boolean => pixel === '#').length;
}


describe('drawDemoCorridor', (): void => {
  it('draws something in the picture window', (): void => {
    const screen: HiresScreen = new HiresScreen();

    drawDemoCorridor(screen, 3);

    expect(litPixelCount(screen.toAscii(PICTURE_LEFT_PIXEL, PICTURE_TOP_ROW, 82, 79))).toBeGreaterThan(100);
  });

  it('keeps every pixel inside the picture window, however deep the corridor', (): void => {
    // The wall edges are aimed at the screen corners and rely entirely on the clip window to cut
    // them off. Widen that window by mistake and they escape into the menu panel beside the maze.
    const screen: HiresScreen = new HiresScreen();

    drawDemoCorridor(screen, 5);

    expect(litPixelCount(screen.toAscii(FIRST_PIXEL_RIGHT_OF_PICTURE, 0, 60, 192))).toBe(0);
  });

  it('leaves the rule below the maze alone', (): void => {
    // Wall edges run past the bottom of the picture, into a row the clip window admits but the
    // picture does not have. Drawing on that row would put a stray pixel in the rule.
    const screen: HiresScreen = new HiresScreen();

    drawDemoCorridor(screen, 5);

    expect(litPixelCount(screen.toAscii(0, PICTURE_TOP_ROW + 79, 280, 8))).toBe(0);
  });

  it('leaves the rows above the picture window untouched', (): void => {
    const screen: HiresScreen = new HiresScreen();

    drawDemoCorridor(screen, 5);

    expect(litPixelCount(screen.toAscii(0, 0, 280, PICTURE_TOP_ROW))).toBe(0);
  });

  it('closes the far wall in towards the centre of the view as the corridor deepens', (): void => {
    // A shallow corridor ends in a wall wide enough that the middle of the view falls inside it
    // and stays empty; a deep one ends in a wall small enough to sit in that middle.
    const shallow: HiresScreen = new HiresScreen();
    const deep: HiresScreen = new HiresScreen();

    drawDemoCorridor(shallow, 1);
    drawDemoCorridor(deep, 4);

    expect(litPixelCount(deep.toAscii(PICTURE_LEFT_PIXEL + 37, PICTURE_TOP_ROW + 37, 8, 8)))
      .toBeGreaterThan(litPixelCount(shallow.toAscii(PICTURE_LEFT_PIXEL + 37, PICTURE_TOP_ROW + 37, 8, 8)));
  });
});


describe('quick plot', (): void => {
  // With a light up, DRAWMAZE looks three squares ahead instead of five. Without one it looks two
  // either way, so quick plot changes nothing in the dark.
  function corridorSeen(quickPlot: boolean, light: number): string {
    const screen: HiresScreen = new HiresScreen();

    g.mazex = CORRIDOR_START_X;
    g.mazey = CORRIDOR_START_Y;
    g.mazelev = 1;
    g.directio = Direction.north;
    g.light = light;

    drawmaze(screen, buildCorridorLevel(5), g, new Random(1), quickPlot);

    return screen.toAscii().join('\n');
  }

  it('draws less of a lit corridor than the full view does', (): void => {
    expect(corridorSeen(true, 10)).not.toBe(corridorSeen(false, 10));
  });

  it('changes nothing in the dark, where the view is two squares either way', (): void => {
    expect(corridorSeen(true, 0)).toBe(corridorSeen(false, 0));
  });
});
