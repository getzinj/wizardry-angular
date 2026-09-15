import type { Random } from './random';

// The keyboard, as GETKEY saw it.
//
//   PROCEDURE GETKEY;                              Wiz1A.DSK/WIZ2.TEXT.txt:280
//     MVCURSOR( 80, 0);   (* ADJUST RANDOM #, AND RETURN WHEN A CHAR IS AVAIL *)
//     UNITREAD( SYSTERM, INBUF, 1, 0, 0);
//     INCHAR := INBUF[ 0];
//     IF EOLN THEN INCHAR := CHR( CRETURN)
//
// MVCURSOR( 80, 0) spins until a key is available, incrementing the random number's first state
// byte on every pass (Wiz1D.DSK/MVCURSOR.TEXT.txt:121-131). That is the game's only entropy: how
// long the player took to press a key. A key already sitting in the type-ahead buffer skips the
// loop entirely and stirs nothing, so pressing keys ahead of a prompt is a different game from
// answering it slowly - and that is reproduced here.
//
// Waiting for a key is one of the two things in the port that suspend - the other is the clock the
// delay loops wait on - which is why every ported procedure is async.

export const RETURN_KEY: string = '\x0D';
export const BACKSPACE_KEY: string = '\x08';
export const ESCAPE_KEY: string = '\x1B';

/** RNG stirs per millisecond of waiting, standing in for the original's polling loop. */
const STIRS_PER_MILLISECOND: number = 1;


/** The character a browser key event stood for on an Apple II, or null for a key it had not got. */
export function appleKeyOf(key: string): string | null {
  let character: string | null = null;

  if (key === 'Enter') {
    character = RETURN_KEY;
  } else if ((key === 'Backspace') || (key === 'ArrowLeft') || (key === 'Delete')) {
    character = BACKSPACE_KEY;
  } else if (key === 'Escape') {
    character = ESCAPE_KEY;
  } else if (key.length === 1) {
    const code: number = key.toUpperCase().charCodeAt(0);

    if ((code >= 32) && (code <= 126)) {
      character = key.toUpperCase();
    }
  }

  return character;
}


export class Keyboard {
  private readonly buffer: string[] = [];

  private waiting_: (() => void) | null = null;

  private readonly now: () => number;


  constructor(private readonly random: Random | null = null,
              now: () => number = (): number => Date.now()) {
    this.now = now;
  }


  /** Type-ahead: everything pressed before the game asked for it is still there when it does. */
  public push(character: string): void {
    this.buffer.push(character);

    const waiter: (() => void) | null = this.waiting_;

    if (waiter != null) {
      this.waiting_ = null;
      waiter();
    }
  }


  /** Translates and queues a browser key event. Returns whether the key meant anything. */
  public pushKey(key: string): boolean {
    const character: string | null = appleKeyOf(key);

    if (character != null) {
      this.push(character);
    }

    return character != null;
  }


  public keypress(): boolean {
    return this.buffer.length > 0;
  }


  /** Whether the game is parked waiting for a key, rather than busy with something else. */
  public get waiting(): boolean {
    return this.waiting_ != null;
  }


  /** UNITCLEAR( 1): drops the type-ahead buffer. */
  public unitclear(): void {
    this.buffer.length = 0;
  }


  /**
   * READ. Waits for a key without the polling loop, so the random number is not stirred. The game
   * uses this where it does not want that - the two disband confirmations, and the prompts that
   * take a whole line - and GETKEY everywhere else.
   */
  public async read(): Promise<string> {
    if (this.buffer.length === 0) {
      await this.waitForKey();
    }

    return this.buffer.shift() as string;
  }


  public async getkey(): Promise<string> {
    if (this.buffer.length === 0) {
      const started: number = this.now();

      await this.waitForKey();

      this.stir(this.now() - started);
    }

    return this.buffer.shift() as string;
  }


  private stir(milliseconds: number): void {
    if (this.random != null) {
      this.random.stir(Math.max(0, Math.round(milliseconds * STIRS_PER_MILLISECOND)));
    }
  }


  private waitForKey(): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
      this.waiting_ = resolve;
    });
  }

}
