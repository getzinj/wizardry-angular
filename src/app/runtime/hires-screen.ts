import type { IApplePalette, IRgb } from './apple-palette';
import { artifactColor } from './apple-palette';
import {
  BYTES_PER_ROW, CLRPICT_CLEAR, CLRPICT_UNUSED, GLYPH_HEIGHT, HIRES_BYTES, HIRES_HEIGHT,
  HIRES_WIDTH, PICTURE_HEIGHT, PIXELS_PER_BYTE, hiresRowOffset, pictureBitMask, pictureByteOffset
} from './apple-hires.constants';


/** Raised where the game called one of MVCURSOR's copy-protection syscalls; those are not ported. */
export class CopyProtectionRemovedError extends Error {
  constructor(magicX: number) {
    super(`MVCURSOR(${ magicX }, ...) is copy-protection and has no port`);
  }
}


/**
 * The Apple II high-resolution screen, emulated as the 8 KB of video memory the game writes to
 * rather than as a drawing surface. Every one of Wizardry's graphics primitives is a short 6502
 * routine that pokes this memory, so porting them means porting their address arithmetic; doing
 * that keeps the sub-byte behaviour the game leans on, such as CLRPICT sparing the four pixels
 * to the left of the picture window, or monster pictures landing one byte in from the edge.
 *
 * Coordinates come in three flavours and it matters which is which:
 *   - character cells, 40 x 24, used by the glyph cursor and by clrrect
 *   - picture pixels, 82 wide, used by clrpict and drawline, inset 4 pixels and 5 rows
 *   - screen pixels, 280 x 192, used only when rendering out to a canvas
 */
export class HiresScreen {
  private readonly memory: Uint8Array = new Uint8Array(HIRES_BYTES);

  /** Glyph cursor column, mirroring the byte MVCURSOR writes and PRGRCHR reads. */
  private cursorColumn: number = 0;

  /** Glyph cursor row, in character cells. */
  private cursorRow: number = 0;

  // The clip window drawline honours, set by clrpict when its last argument is neither 100 nor
  // 101. Defaults span the whole picture so a drawline before any clrpict still plots.
  private clipLeft: number = 0;
  private clipTop: number = 0;
  private clipRight: number = HIRES_WIDTH;
  private clipBottom: number = HIRES_HEIGHT;

  /** Set by every mutation, cleared by the view once it has repainted. */
  public dirty: boolean = true;


  public get column(): number {
    return this.cursorColumn;
  }


  public get row(): number {
    return this.cursorRow;
  }


  /** Direct view of video memory, for the picture blits and for tests. */
  public get bytes(): Uint8Array {
    return this.memory;
  }


  /** Erases all of video memory. The real machine had no such call; the boot code left it dirty. */
  public setCursor(column: number, row: number): void {
    this.cursorColumn = column;
    this.cursorRow = row;
  }


  public clearAll(): void {
    this.memory.fill(0);
    this.dirty = true;
  }


  /**
   * Draws one 7x8 glyph at the cursor and advances the cursor one cell to the right, exactly as
   * PRGRCHR does. Glyph rows are bytes of video memory, so bit 0 is the leftmost pixel. The glyph
   * replaces what was there; it is not merged with it.
   */
  public prgrchr(glyph: ArrayLike<number>): void {
    const base: number = hiresRowOffset(this.cursorRow * GLYPH_HEIGHT) + this.cursorColumn;

    for (let glyphRow: number = 0; glyphRow < GLYPH_HEIGHT; glyphRow++) {
      this.memory[base + (glyphRow * 0x400)] = glyph[glyphRow] & 0xFF;
    }

    this.cursorColumn = this.cursorColumn + 1;
    this.dirty = true;
  }


  /** Clears a rectangle measured in character cells: width in columns, height in rows. */
  public clrrect(column: number, row: number, width: number, height: number): void {
    for (let cell: number = 0; cell < height; cell++) {
      const base: number = hiresRowOffset((row + cell) * GLYPH_HEIGHT) + column;

      for (let glyphRow: number = 0; glyphRow < GLYPH_HEIGHT; glyphRow++) {
        const start: number = base + (glyphRow * 0x400);

        this.memory.fill(0, start, start + width);
      }
    }

    this.dirty = true;
  }


  /**
   * Two routines behind one name, chosen by the fourth argument: 100 erases the picture window,
   * anything else (bar the unused 101) sets the clip window drawline will honour, without
   * erasing anything.
   */
  public clrpict(left: number, top: number, right: number, bottom: number): void {
    if (bottom === CLRPICT_CLEAR) {
      this.clearPicture();
    } else if (bottom === CLRPICT_UNUSED) {
      throw new Error('CLRPICT mode 101 is dead code in Wizardry I and has no port');
    } else {
      this.clipLeft = left;
      this.clipTop = top;
      this.clipRight = right;
      this.clipBottom = bottom;
    }
  }


  /**
   * Plots up to lineLength pixels from (x, y) in picture space, stepping by (deltaX, deltaY) with
   * each component in -1, 0 or 1. Pixels outside the clip window are skipped rather than ending
   * the line, so a line may leave the window and come back. Pixels are merged in, not replaced.
   */
  public drawline(x: number, y: number, deltaX: number, deltaY: number, lineLength: number): void {
    let plotX: number = x;
    let plotY: number = y;

    for (let step: number = 0; step < lineLength; step++) {
      const inWindow: boolean = (plotX >= this.clipLeft) && (plotX <= this.clipRight) &&
                                (plotY >= this.clipTop) && (plotY <= this.clipBottom);

      // The clip window admits one row more than the picture has, and the game sets it that way
      // on every maze frame. The original's own row addresses stop at the last real row, so a
      // pixel on that extra row was written from an address past the end of the table and landed
      // somewhere that was not the screen. Nothing was drawn, so nothing is drawn here: computing
      // the address that row would have had puts a stray pixel in the rule below the maze.
      if (inWindow && (plotY < PICTURE_HEIGHT)) {
        const offset: number = this.pictureRowOffset(plotY) + pictureByteOffset(plotX);

        this.memory[offset] = this.memory[offset] | pictureBitMask(plotX);
      }

      plotX = plotX + deltaX;
      plotY = plotY + deltaY;
    }

    this.dirty = true;
  }


  /**
   * Copies one row of a stored picture into video memory. Monster and chest pictures are raw
   * bitmaps on disk, 10 bytes (70 pixels) per row, and the game drops them straight into the rows
   * of the picture window starting one byte in from the left edge.
   */
  public blitPictureRow(pixelRow: number, source: ArrayLike<number>, sourceOffset: number, byteCount: number): void {
    const base: number = hiresRowOffset(pixelRow) + 1;

    for (let index: number = 0; index < byteCount; index++) {
      this.memory[base + index] = source[sourceOffset + index] & 0xFF;
    }

    this.dirty = true;
  }


  /**
   * Paints video memory into an RGBA buffer of 280 x 192 pixels. Colour is decided per pixel from
   * its neighbours, its column and the palette bit of its byte; a monochrome palette collapses
   * all of that to one colour.
   */
  public render(target: Uint8ClampedArray, palette: IApplePalette): void {
    const lit: boolean[] = new Array<boolean>(HIRES_WIDTH);
    const paletteBits: boolean[] = new Array<boolean>(HIRES_WIDTH);

    for (let pixelRow: number = 0; pixelRow < HIRES_HEIGHT; pixelRow++) {
      const rowBase: number = hiresRowOffset(pixelRow);

      for (let byteIndex: number = 0; byteIndex < BYTES_PER_ROW; byteIndex++) {
        const value: number = this.memory[rowBase + byteIndex];
        const paletteBit: boolean = (value & 0x80) !== 0;

        for (let bit: number = 0; bit < PIXELS_PER_BYTE; bit++) {
          const column: number = (byteIndex * PIXELS_PER_BYTE) + bit;

          lit[column] = (value & (1 << bit)) !== 0;
          paletteBits[column] = paletteBit;
        }
      }

      for (let column: number = 0; column < HIRES_WIDTH; column++) {
        const leftLit: boolean = (column > 0) && lit[column - 1];
        const rightLit: boolean = (column < (HIRES_WIDTH - 1)) && lit[column + 1];
        const color: IRgb = artifactColor(palette, lit[column], leftLit, rightLit, column, paletteBits[column]);
        const target0: number = ((pixelRow * HIRES_WIDTH) + column) * 4;

        target[target0] = color.r;
        target[target0 + 1] = color.g;
        target[target0 + 2] = color.b;
        target[target0 + 3] = 255;
      }
    }
  }


  /**
   * Renders a rectangle of screen pixels as text, '#' for lit and '.' for dark, one string per
   * pixel row. Specs assert against this rather than against raw bytes.
   */
  public toAscii(left: number = 0, top: number = 0, width: number = HIRES_WIDTH, height: number = HIRES_HEIGHT): string[] {
    const rows: string[] = [];

    for (let pixelRow: number = top; pixelRow < (top + height); pixelRow++) {
      const rowBase: number = hiresRowOffset(pixelRow);
      let line: string = '';

      for (let column: number = left; column < (left + width); column++) {
        const value: number = this.memory[rowBase + Math.floor(column / PIXELS_PER_BYTE)];

        line = line + (((value & (1 << (column % PIXELS_PER_BYTE))) !== 0) ? '#' : '.');
      }

      rows.push(line);
    }

    return rows;
  }


  private pictureRowOffset(pictureY: number): number {
    // DRAWLINE indexes a 79-entry table that begins at screen row 5, so picture row 0 is screen
    // row 5. The clip test admits y = 79, one past the table's end, which on the real machine
    // read whatever followed it in memory; here it simply addresses screen row 84.
    return hiresRowOffset(pictureY + 5);
  }


  private clearPicture(): void {
    for (let pictureY: number = 0; pictureY < PICTURE_HEIGHT; pictureY++) {
      const base: number = this.pictureRowOffset(pictureY);

      // The picture is 82 pixels starting 4 pixels in: the top 3 pixels of byte 0, all of bytes
      // 1 to 11, and the low 2 pixels of byte 12. The pixels either side are the screen border
      // and belong to whatever drew them.
      this.memory[base] = this.memory[base] & 0x0F;
      this.memory.fill(0, base + 1, base + 12);
      this.memory[base + 12] = this.memory[base + 12] & 0xFC;
    }

    this.dirty = true;
  }

}
