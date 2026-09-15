import { TEXT_COLUMNS, TEXT_ROWS } from './apple-hires.constants';

// The ordinary 40-column text screen, which is a different display from the high-resolution one.
//
// The machine had both and the game used both. The castle, the training grounds and the shops are
// written with GOTOXY and WRITE; the maze and combat draw glyphs onto the hi-res screen instead.
// Neither knows about the other, and switching modes is switching which one the monitor shows.
//
// Control characters are Apple Pascal's, not ASCII's general meaning: they erase parts of the
// screen relative to the cursor, which is how the game takes a menu down without repainting what
// surrounds it. These six are the only ones the game writes.

/** Sounds the speaker. */
export const BELL: string = '\x07';

export const BACKSPACE: string = '\x08';

/** Erases from the cursor to the bottom of the screen. */
export const CLEAR_TO_END_OF_SCREEN: string = '\x0B';

/** Erases the whole screen and puts the cursor back in the corner. */
export const CLEAR_SCREEN: string = '\x0C';

export const RETURN: string = '\x0D';

/** Erases from the cursor to the end of its own line. */
export const CLEAR_TO_END_OF_LINE: string = '\x1D';

const SPACE: string = ' ';


export class TextScreen {
  private readonly cells: string[][] = TextScreen.blank();

  private column: number = 0;
  private row: number = 0;

  /** Rung by a bell character, for whoever is showing the screen to react to. */
  public bells: number = 0;

  public dirty: boolean = true;


  private static blank(): string[][] {
    return Array.from({ length: TEXT_ROWS },
                      (): string[] => new Array<string>(TEXT_COLUMNS).fill(SPACE));
  }


  public get cursorColumn(): number {
    return this.column;
  }


  public get cursorRow(): number {
    return this.row;
  }


  /**
   * Moves the cursor. The game parks it at column 41 whenever it is about to wait for a key, which
   * is how it hides the blinking cursor, so a column past the edge is normal and is not clamped.
   */
  public gotoxy(column: number, row: number): void {
    this.column = column;
    this.row = row;
  }


  public clear(): void {
    for (const line of this.cells) {
      line.fill(SPACE);
    }

    this.column = 0;
    this.row = 0;
    this.dirty = true;
  }


  public write(text: string): void {
    for (const character of text) {
      this.writeCharacter(character);
    }

    this.dirty = true;
  }


  public writeln(text: string = ''): void {
    this.write(text + RETURN);
  }


  /** One row as text, for tests and for painting. */
  public line(index: number): string {
    return this.cells[index].join('');
  }


  /** The whole screen as text, one row per line. */
  public toString(): string {
    return this.cells.map((_: string[], index: number): string => this.line(index)).join('\n');
  }


  private writeCharacter(character: string): void {
    switch (character) {
      case BELL:
        this.bells = this.bells + 1;
        break;

      case BACKSPACE:
        this.column = Math.max(0, this.column - 1);
        break;

      case CLEAR_TO_END_OF_SCREEN:
        this.clearToEndOfScreen();
        break;

      case CLEAR_SCREEN:
        this.clear();
        break;

      case RETURN:
        this.column = 0;
        this.nextRow();
        break;

      case CLEAR_TO_END_OF_LINE:
        this.clearToEndOfLine();
        break;

      default:
        this.put(character);
        break;
    }
  }


  private put(character: string): void {
    const onScreen: boolean = this.onScreen();

    if (onScreen) {
      this.cells[this.row][this.column] = character;
    }

    this.column = this.column + 1;

    if (onScreen && (this.column >= TEXT_COLUMNS)) {
      this.column = 0;
      this.nextRow();
    }
  }


  private onScreen(): boolean {
    return (this.column >= 0) && (this.column < TEXT_COLUMNS)
        && (this.row >= 0) && (this.row < TEXT_ROWS);
  }


  private nextRow(): void {
    this.row = this.row + 1;

    if (this.row >= TEXT_ROWS) {
      this.scroll();
      this.row = TEXT_ROWS - 1;
    }
  }


  private scroll(): void {
    this.cells.shift();
    this.cells.push(new Array<string>(TEXT_COLUMNS).fill(SPACE));
  }


  private clearToEndOfLine(): void {
    if ((this.row >= 0) && (this.row < TEXT_ROWS)) {
      for (let column: number = Math.max(0, this.column); column < TEXT_COLUMNS; column++) {
        this.cells[this.row][column] = SPACE;
      }
    }
  }


  private clearToEndOfScreen(): void {
    this.clearToEndOfLine();

    for (let row: number = Math.max(0, this.row + 1); row < TEXT_ROWS; row++) {
      this.cells[row].fill(SPACE);
    }
  }

}
