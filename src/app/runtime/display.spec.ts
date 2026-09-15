import { describe, expect, it } from 'vitest';

import { Display } from './display';
import { CopyProtectionRemovedError } from './hires-screen';
import { WHITE_PHOSPHOR_PALETTE } from './apple-palette';
import { HIRES_HEIGHT, HIRES_WIDTH } from './apple-hires.constants';


function rendered(display: Display): Uint8ClampedArray {
  const pixels: Uint8ClampedArray = new Uint8ClampedArray(HIRES_WIDTH * HIRES_HEIGHT * 4);

  display.render(pixels, WHITE_PHOSPHOR_PALETTE);

  return pixels;
}


function isBlank(pixels: Uint8ClampedArray): boolean {
  return pixels.every((value: number, index: number): boolean => ((index % 4) === 3) || (value === 0));
}


describe('which screen the monitor is showing', (): void => {
  it('starts on the text screen, as the machine booted', (): void => {
    expect(new Display().mode).toBe('text');
  });

  it('switches to graphics on MVCURSOR( 40, 0)', (): void => {
    const display: Display = new Display();

    display.mvcursor(40, 0);

    expect(display.mode).toBe('graphics');
  });

  it('switches back to text on MVCURSOR( 50, 0)', (): void => {
    const display: Display = new Display();

    display.mvcursor(40, 0);
    display.mvcursor(50, 0);

    expect(display.mode).toBe('text');
  });

  it('shows the graphics page in graphics mode', (): void => {
    const display: Display = new Display();

    display.text.write('HIDDEN');
    display.mvcursor(40, 0);

    expect(isBlank(rendered(display))).toBe(true);
  });

  it('shows the text page in text mode', (): void => {
    const display: Display = new Display();

    display.text.write('SHOWN');

    expect(isBlank(rendered(display))).toBe(false);
  });

  it('keeps what the graphics page held while text was showing', (): void => {
    const display: Display = new Display();

    display.mvcursor(40, 0);
    display.hires.drawline(0, 0, 1, 0, 20);
    display.mvcursor(50, 0);
    display.mvcursor(40, 0);

    expect(isBlank(rendered(display))).toBe(false);
  });
});


describe('moving the glyph cursor', (): void => {
  it('moves it for an ordinary column', (): void => {
    const display: Display = new Display();

    display.mvcursor(7, 3);

    expect([ display.hires.column, display.hires.row ]).toEqual([ 7, 3 ]);
  });
});


describe("MVCURSOR's syscalls that have no port", (): void => {
  it('refuses the copy-protection jump', (): void => {
    expect((): void => new Display().mvcursor(60, 0)).toThrow(CopyProtectionRemovedError);
  });

  it('refuses the copy-protection crash', (): void => {
    expect((): void => new Display().mvcursor(70, 0)).toThrow(CopyProtectionRemovedError);
  });

  it('sends the wait-for-a-key loop to the keyboard instead', (): void => {
    expect((): void => new Display().mvcursor(80, 0)).toThrow(/getkey/);
  });
});
