import { describe, expect, it } from 'vitest';

import { BYTES_PER_ROW, hiresRowOffset, pictureBitMask, pictureByteOffset } from './apple-hires.constants';
import { HiresScreen } from './hires-screen';
import { BUILTIN_GRAPHICS_FONT } from './builtin-font';
import { Charset } from './charset';


describe('hiresRowOffset', (): void => {
  // The 6502 routines reach video memory through two address tables. PRGRCHR and CLRRECT share a
  // 24-entry table of character rows; CLRPICT and DRAWLINE use one that starts at pixel row 5.
  // These cases are entries transcribed from those tables, as offsets from the $2000 base.

  it('puts the first character row at the start of video memory', (): void => {
    expect(hiresRowOffset(0)).toBe(0x0000);
  });

  it('puts the second character row a band below the first', (): void => {
    expect(hiresRowOffset(8)).toBe(0x0080);
  });

  it('puts the ninth character row in the second third of the screen', (): void => {
    expect(hiresRowOffset(64)).toBe(0x0028);
  });

  it('puts the seventeenth character row in the last third of the screen', (): void => {
    expect(hiresRowOffset(128)).toBe(0x0050);
  });

  it('places the first row of the picture window where the line table begins', (): void => {
    expect(hiresRowOffset(5)).toBe(0x1400);
  });

  it('keeps the last pixel row inside video memory', (): void => {
    expect(hiresRowOffset(191) + BYTES_PER_ROW).toBeLessThanOrEqual(8192);
  });
});


describe('picture coordinates', (): void => {
  it('starts the picture window four pixels in, inside the first byte', (): void => {
    expect(pictureByteOffset(0)).toBe(0);
  });

  it('lights the fifth pixel of that byte for the leftmost picture column', (): void => {
    expect(pictureBitMask(0)).toBe(0x10);
  });

  it('moves to the next byte once past the first byte\'s three spare pixels', (): void => {
    expect(pictureByteOffset(3)).toBe(1);
  });

  it('starts that byte at its leftmost pixel', (): void => {
    expect(pictureBitMask(3)).toBe(0x01);
  });

  it('ends the 82-pixel window in the thirteenth byte', (): void => {
    expect(pictureByteOffset(81)).toBe(12);
  });

  it('ends it on that byte\'s second pixel', (): void => {
    expect(pictureBitMask(81)).toBe(0x02);
  });
});


describe('HiresScreen.prgrchr', (): void => {
  it('draws a glyph as eight pixel rows at the cursor', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.setCursor(0, 0);
    screen.prgrchr([0x7F, 0, 0, 0, 0, 0, 0, 0]);

    expect(screen.toAscii(0, 0, 7, 1)).toEqual(['#######']);
  });

  it('advances the cursor one cell to the right', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.setCursor(4, 2);
    screen.prgrchr([0, 0, 0, 0, 0, 0, 0, 0]);

    expect(screen.column).toBe(5);
  });

  it('replaces what was already in the cell rather than merging with it', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.setCursor(0, 0);
    screen.prgrchr([0x7F, 0, 0, 0, 0, 0, 0, 0]);
    screen.setCursor(0, 0);
    screen.prgrchr([0x01, 0, 0, 0, 0, 0, 0, 0]);

    expect(screen.toAscii(0, 0, 7, 1)).toEqual(['#......']);
  });
});


describe('HiresScreen.clrrect', (): void => {
  it('clears every pixel row of the cells it covers', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.setCursor(1, 0);
    screen.prgrchr([0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F]);
    screen.clrrect(1, 0, 1, 1);

    expect(screen.toAscii(7, 0, 7, 8).join('')).not.toContain('#');
  });

  it('leaves the cells either side of it alone', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.setCursor(0, 0);
    screen.prgrchr([0x7F, 0, 0, 0, 0, 0, 0, 0]);
    screen.clrrect(1, 0, 1, 1);

    expect(screen.toAscii(0, 0, 7, 1)).toEqual(['#######']);
  });
});


describe('HiresScreen.drawline', (): void => {
  it('plots a horizontal run of the length it is given', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.clrpict(0, 0, 81, 79);
    screen.drawline(0, 0, 1, 0, 5);

    expect(screen.toAscii(4, 5, 6, 1)).toEqual(['#####.']);
  });

  it('plots a vertical run down the picture rows', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.clrpict(0, 0, 81, 79);
    screen.drawline(0, 0, 0, 1, 3);

    expect(screen.toAscii(4, 5, 1, 4)).toEqual(['#', '#', '#', '.']);
  });

  it('skips pixels outside the clip window without ending the line', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.clrpict(2, 0, 81, 79);
    screen.drawline(0, 0, 1, 0, 5);

    expect(screen.toAscii(4, 5, 6, 1)).toEqual(['..###.']);
  });

  it('merges with pixels already drawn rather than replacing them', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.clrpict(0, 0, 81, 79);
    screen.drawline(0, 0, 1, 0, 2);
    screen.drawline(1, 0, 1, 0, 2);

    expect(screen.toAscii(4, 5, 5, 1)).toEqual(['###..']);
  });
});


describe('HiresScreen.clrpict when told to clear', (): void => {
  it('erases the picture window', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.clrpict(0, 0, 81, 79);
    screen.drawline(0, 0, 1, 0, 82);
    screen.clrpict(0, 0, 0, 100);

    expect(screen.toAscii(4, 5, 82, 1).join('')).not.toContain('#');
  });

  it('spares the four pixels to the left of the window, where the frame is drawn', (): void => {
    const screen: HiresScreen = new HiresScreen();

    screen.setCursor(0, 0);
    screen.prgrchr([0, 0, 0, 0, 0, 0x0F, 0, 0]);
    screen.clrpict(0, 0, 0, 100);

    expect(screen.toAscii(0, 5, 4, 1)).toEqual(['####']);
  });
});


describe('HiresScreen.render', (): void => {
  it('paints a lit pixel with a lit neighbour as white', (): void => {
    const screen: HiresScreen = new HiresScreen();
    const target: Uint8ClampedArray = new Uint8ClampedArray(280 * 192 * 4);

    screen.clrpict(0, 0, 81, 79);
    screen.drawline(0, 0, 1, 0, 2);
    screen.render(target, { name: 't', background: { r: 0, g: 0, b: 0 }, white: { r: 1, g: 1, b: 1 },
      violet: { r: 2, g: 2, b: 2 }, green: { r: 3, g: 3, b: 3 }, blue: { r: 4, g: 4, b: 4 }, orange: { r: 5, g: 5, b: 5 } });

    expect(target[((5 * 280) + 4) * 4]).toBe(1);
  });

  it('paints an isolated lit pixel with its column\'s artifact colour', (): void => {
    const screen: HiresScreen = new HiresScreen();
    const target: Uint8ClampedArray = new Uint8ClampedArray(280 * 192 * 4);

    screen.clrpict(0, 0, 81, 79);
    screen.drawline(0, 0, 1, 0, 1);
    screen.render(target, { name: 't', background: { r: 0, g: 0, b: 0 }, white: { r: 1, g: 1, b: 1 },
      violet: { r: 2, g: 2, b: 2 }, green: { r: 3, g: 3, b: 3 }, blue: { r: 4, g: 4, b: 4 }, orange: { r: 5, g: 5, b: 5 } });

    expect(target[((5 * 280) + 4) * 4]).toBe(2);
  });
});


describe('Charset', (): void => {
  it('renders a glyph from the loaded font', (): void => {
    const screen: HiresScreen = new HiresScreen();
    const charset: Charset = new Charset(BUILTIN_GRAPHICS_FONT);

    screen.setCursor(0, 0);
    screen.prgrchr(charset.glyph('"'));

    expect(screen.toAscii(0, 3, 7, 1)).toEqual(['#######']);
  });

  it('renders characters outside the font as blanks', (): void => {
    const charset: Charset = new Charset();

    expect([...charset.glyph('~')]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
