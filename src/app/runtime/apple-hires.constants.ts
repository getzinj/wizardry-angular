// Geometry of the Apple II high-resolution screen and of Wizardry's "picture" window
// inside it. Sources are the 6502 externals the game links against:
//   Wiz1D.DSK/PRGRCHR.TEXT.txt   glyph blit + the 24-entry character-row address table
//   Wiz1D.DSK/CLRRECT.TEXT.txt   character-cell clears
//   Wiz1D.DSK/CLRPICT.TEXT.txt   picture clear (82 x 79 pixels) and clip-window set
//   Wiz1D.DSK/DRAWLINE.TEXT.txt  clipped line plotting, and the picture-area offset tables

export const HIRES_WIDTH: number = 280;
export const HIRES_HEIGHT: number = 192;

/** Bytes of Apple II video memory ($2000-$3FFF). Seven pixels per byte, bit 7 is the palette bit. */
export const HIRES_BYTES: number = 8192;

/** Pixels held in one byte of video memory; bit 0 is the leftmost of them. */
export const PIXELS_PER_BYTE: number = 7;

/** Bytes spanning one pixel row: 40 * 7 = 280 pixels. */
export const BYTES_PER_ROW: number = 40;

export const TEXT_COLUMNS: number = 40;
export const TEXT_ROWS: number = 24;

/** A glyph is 7 pixels wide (one byte) by 8 pixel rows: one character cell. */
export const GLYPH_HEIGHT: number = 8;

// The picture window is inset four pixels from the left edge and starts five pixel rows down;
// DRAWLINE's own offset tables begin at screen row 5 and leave byte 0's low four pixels alone.
export const PICTURE_LEFT_PIXEL: number = 4;
export const PICTURE_TOP_ROW: number = 5;
export const PICTURE_WIDTH: number = 82;

/** Rows CLRPICT actually erases: picture y of 0..78. The clip window separately admits y = 79. */
export const PICTURE_HEIGHT: number = 79;

/** Rightmost picture column, and the value the game passes as the clip window's right edge. */
export const PICTURE_RIGHT: number = PICTURE_WIDTH - 1;

/** Bottom of the clip window. One row past what CLRPICT erases, which is how the game sets it. */
export const PICTURE_CLIP_BOTTOM: number = 79;

/** CLRPICT's fourth argument when it means "erase the picture" rather than "set the clip window". */
export const CLRPICT_CLEAR: number = 100;

/** CLRPICT's fourth argument for a mode Wizardry I never uses (the code path exists but is dead). */
export const CLRPICT_UNUSED: number = 101;

// MVCURSOR is overloaded: an x below the column count moves the glyph cursor, and these five
// values are really syscalls. See the comment block at Wiz1A.DSK/WIZ.TEXT.txt:401-410.
export const MVCURSOR_GRAPHICS_MODE: number = 40;
export const MVCURSOR_TEXT_MODE: number = 50;
export const MVCURSOR_COPY_PROTECT_JUMP: number = 60;
export const MVCURSOR_COPY_PROTECT_CRASH: number = 70;
export const MVCURSOR_STIR_RANDOM: number = 80;

/**
 * Address of the leftmost byte of a pixel row, as an offset into the 8 KB screen buffer.
 *
 * The Apple II interleaves rows in three groups of eight bands. PRGRCHR and CLRRECT reach the
 * same addresses through a 24-entry table of character rows, and CLRPICT and DRAWLINE through a
 * 79-entry table that starts at pixel row 5; both tables are reproduced exactly by this formula,
 * which is what apple-hires.constants.spec.ts pins.
 */
export function hiresRowOffset(pixelRow: number): number {
  return ((pixelRow & 7) * 0x400) + (((pixelRow >> 3) & 7) * 0x80) + ((pixelRow >> 6) * BYTES_PER_ROW);
}

/** Byte holding a picture-space pixel, mirroring DRAWLINE's L5A40 table. */
export function pictureByteOffset(pictureX: number): number {
  return Math.floor((pictureX + PICTURE_LEFT_PIXEL) / PIXELS_PER_BYTE);
}

/** Bit mask for a picture-space pixel within its byte, mirroring DRAWLINE's L5A92 table. */
export function pictureBitMask(pictureX: number): number {
  return 1 << ((pictureX + PICTURE_LEFT_PIXEL) % PIXELS_PER_BYTE);
}
