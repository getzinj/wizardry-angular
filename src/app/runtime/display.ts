import {
  MVCURSOR_COPY_PROTECT_CRASH, MVCURSOR_COPY_PROTECT_JUMP, MVCURSOR_GRAPHICS_MODE,
  MVCURSOR_STIR_RANDOM, MVCURSOR_TEXT_MODE, TEXT_COLUMNS, TEXT_ROWS
} from './apple-hires.constants';
import type { IApplePalette } from './apple-palette';
import { Charset } from './charset';
import { CopyProtectionRemovedError, HiresScreen } from './hires-screen';
import { TextScreen } from './text-screen';

// The two screens and the switch between them.
//
// MVCURSOR moves the hi-res glyph cursor, but five column numbers past the end of the screen are
// really syscalls (Wiz1A.DSK/WIZ.TEXT.txt:401-410): 40 shows the graphics page, 50 shows the text
// page, 60 and 70 are copy protection, and 80 waits for a key. Which screen the player is looking
// at is therefore decided by the same call that positions text on it.

/** Anything the canvas can show: the graphics page, or the text page drawn as glyphs. */
export interface IRenderableScreen {
  dirty: boolean;

  render(target: Uint8ClampedArray, palette: IApplePalette): void;
}


export type DisplayMode = 'text' | 'graphics';


export class Display {
  public readonly hires: HiresScreen = new HiresScreen();
  public readonly text: TextScreen = new TextScreen();

  /** The font PRGRCHR draws with. The game swaps it for box-drawing pieces and back again. */
  public readonly charset: Charset = new Charset();

  /** Where the text page is drawn as glyphs, so one canvas can show whichever page is current. */
  private readonly textPage: HiresScreen = new HiresScreen();

  /** The text page's font, which on the real machine was the Apple's own, not the game's. */
  public readonly textFont: Charset = new Charset();

  private currentMode: DisplayMode = 'text';


  public get mode(): DisplayMode {
    return this.currentMode;
  }


  public set mode(mode: DisplayMode) {
    if (mode !== this.currentMode) {
      this.currentMode = mode;
      this.textPage.dirty = true;
      this.hires.dirty = true;
    }
  }


  /** The page the monitor is showing. */
  public get visible(): IRenderableScreen {
    return (this.currentMode === 'graphics') ? this.hires : this.textPage;
  }


  public get dirty(): boolean {
    return (this.currentMode === 'graphics') ? this.hires.dirty : this.text.dirty;
  }


  public set dirty(dirty: boolean) {
    if (this.currentMode === 'graphics') {
      this.hires.dirty = dirty;
    } else {
      this.text.dirty = dirty;
    }
  }


  public mvcursor(magicX: number, y: number): void {
    switch (magicX) {
      case MVCURSOR_GRAPHICS_MODE:
        this.mode = 'graphics';
        break;

      case MVCURSOR_TEXT_MODE:
        this.mode = 'text';
        break;

      case MVCURSOR_COPY_PROTECT_JUMP:
      case MVCURSOR_COPY_PROTECT_CRASH:
        throw new CopyProtectionRemovedError(magicX);

      case MVCURSOR_STIR_RANDOM:
        throw new Error('MVCURSOR(80, ...) is the wait-for-a-key loop; call Keyboard.getkey');

      default:
        this.hires.setCursor(magicX, y);
        break;
    }
  }


  /** Draws whichever page is current, turning the text cells into glyphs when they are. */
  public render(target: Uint8ClampedArray, palette: IApplePalette): void {
    if (this.currentMode === 'text') {
      this.paintText();
    }

    this.visible.render(target, palette);
  }


  private paintText(): void {
    this.textPage.clearAll();

    for (let row: number = 0; row < TEXT_ROWS; row++) {
      const line: string = this.text.line(row);

      this.textPage.setCursor(0, row);

      for (let column: number = 0; column < TEXT_COLUMNS; column++) {
        this.textPage.prgrchr(this.textFont.glyph(line[column]));
      }
    }

    this.text.dirty = false;
  }

}
