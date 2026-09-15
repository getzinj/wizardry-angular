import { GLYPH_HEIGHT } from './apple-hires.constants';
import { BUILTIN_TEXT_FONT, FIRST_GLYPH_CHARACTER, GLYPH_COUNT } from './builtin-font';


/**
 * The 64 glyphs the screen draws with, covering character codes 32 to 95.
 *
 * On the real machine this is a 512-byte array the game reads straight off its disk, and it swaps
 * between two of them: an ordinary text font and one whose punctuation slots hold line-drawing
 * pieces for the screen frame and the tombstones. Loading a font is therefore a normal part of
 * drawing a screen, not start-up configuration.
 */
export class Charset {
  private glyphs: Uint8Array;


  constructor(glyphs: Uint8Array = BUILTIN_TEXT_FONT) {
    this.glyphs = glyphs;
  }


  /** Replaces every glyph from one 512-byte disk block. */
  public load(block: Uint8Array): void {
    if (block.length < (GLYPH_COUNT * GLYPH_HEIGHT)) {
      throw new Error(`a font needs ${ GLYPH_COUNT * GLYPH_HEIGHT } bytes, got ${ block.length }`);
    } else {
      this.glyphs = block.slice(0, GLYPH_COUNT * GLYPH_HEIGHT);
    }
  }


  /**
   * The eight rows of one character's glyph. Characters outside the font render as a blank, which
   * is kinder than the original: there, an out-of-range code read whatever followed the table.
   */
  public glyph(character: string): Uint8Array {
    const index: number = character.charCodeAt(0) - FIRST_GLYPH_CHARACTER;

    if ((index >= 0) && (index < GLYPH_COUNT)) {
      return this.glyphs.subarray(index * GLYPH_HEIGHT, (index + 1) * GLYPH_HEIGHT);
    } else {
      return new Uint8Array(GLYPH_HEIGHT);
    }
  }

}
