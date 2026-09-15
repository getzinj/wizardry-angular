// Wiz1A.DSK/WIZ2.TEXT.txt - the wrappers every segment calls.
//
// These stand between the game and its machine: writing to the text screen, reading a key, and
// the twelve-digit decimal arithmetic that gold and experience are kept in. The original's GETREC
// and GETRECW are not here; they handed out an offset into a block cache that callers MOVELEFT
// records through, and ScenarioDisk already does that job with the record layouts.

import { rt } from '../runtime/runtime';
import { exit, withExitSync } from '../runtime/pascal-exit';
import { BELL, RETURN } from '../runtime/text-screen';
import { CRETURN, g } from './wiz';
import type { ITwizlong } from './wiz';

/** A value to write, on its own or right-justified in a field, as Pascal's WRITE( X :N). */
export type Written = string | number | readonly [value: string | number, width: number];

/** Digits in a TWIZLONG spread out one per element, plus the carry slot at index 0. */
export type Tbcd = number[];

const BCD_DIGITS: number = 14;

/**
 * Milliseconds one pass of an empty FOR loop took under UCSD Pascal on the Apple II. An empty
 * iteration is three or four p-codes and the p-machine ran ten to fifteen thousand a second on a
 * 1 MHz 6502, which puts a pass between 0.25 and 0.4 ms; this is the top of that range. It is the
 * one number to turn if the game feels too slow or too fast, and wiz2.spec.ts pins it.
 */
export const MILLISECONDS_PER_LOOP: number = 0.4;


export function chr(code: number): string {
  return String.fromCharCode(code);
}


export function ord(character: string): number {
  return character.charCodeAt(0);
}


/**
 * Pascal's INTEGER is one signed sixteen-bit word and arithmetic on it wraps round rather than
 * growing, which matters where the game adds numbers up without caring how big they get: a spell
 * name long enough hashes to a number that has gone round the houses.
 */
export function int16(value: number): number {
  const wrapped: number = value & 0xFFFF;

  return (wrapped >= 0x8000) ? (wrapped - 0x10000) : wrapped;
}


function formatted(value: Written): string {
  let text: string;

  if (Array.isArray(value)) {
    const [ inner, width ]: readonly [string | number, number] = value as readonly [string | number, number];

    text = String(inner).padStart(width);
  } else {
    text = String(value);
  }

  return text;
}


export function write(...values: readonly Written[]): void {
  rt().display.text.write(values.map(formatted).join(''));
}


export function writeln(...values: readonly Written[]): void {
  write(...values, RETURN);
}


export function gotoxy(column: number, row: number): void {
  rt().display.text.gotoxy(column, row);
}


/** RANDOM. Zero to 32767; the game always takes it MOD something. */
export function random(): number {
  return rt().random.next();
}


export function printbel(): void {
  write(BELL, BELL, BELL);
}


export function keyavail(): boolean {
  return rt().keyboard.keypress();
}


export function unitclear(): void {
  rt().keyboard.unitclear();
}


/**
 * GETKEY. The original called MVCURSOR( 80, 0) first, which span until a key was available while
 * stirring the random number; Keyboard.getkey does both.
 */
export async function getkey(): Promise<string> {
  g.inchar = await rt().keyboard.getkey();

  return g.inchar;
}


/** READ( INCHAR). A key, without the wait that stirs the random number. */
export async function read(): Promise<string> {
  g.inchar = await rt().keyboard.read();

  return g.inchar;
}


/** GETLINE. Echoes what is typed, takes space through 'Z' only, and stops at a carriage return. */
export async function getline(): Promise<string> {
  let gtstring: string = '';

  do {
    await getkey();

    if ((g.inchar >= ' ') && (g.inchar <= 'Z') && (gtstring.length < 40)) {
      gtstring = gtstring + g.inchar;
      write(g.inchar);
    } else if (g.inchar === chr(8)) {
      if (gtstring.length > 0) {
        write(g.inchar, ' ', g.inchar);
        gtstring = gtstring.substring(0, gtstring.length - 1);
      }
    }
  } while (g.inchar !== chr(CRETURN));

  return gtstring;
}


/**
 * GETSTR. GETLINE's opposite number: it echoes onto the high-resolution page with PRINTCHR rather
 * than onto the text page, which is what the maze needs, since that is the page being shown. It
 * takes any printable character, marks where the next one will go with an at-sign, and escape
 * wipes the field and starts again.
 */
export async function getstr(winxpos: number, winypos: number): Promise<string> {
  let astring: string = '';

  do {
    rt().display.mvcursor(winxpos + astring.length, winypos);
    printchr(chr(64));
    await getkey();

    if (g.inchar === chr(27)) {
      rt().display.hires.clrrect(winxpos, winypos, astring.length + 1, 1);
      astring = '';
    } else if ((g.inchar === chr(8)) && (astring.length > 0)) {
      rt().display.hires.clrrect(winxpos + astring.length, winypos, 1, 1);
      astring = astring.substring(0, astring.length - 1);
    } else if ((g.inchar !== chr(CRETURN)) && (ord(g.inchar) >= 32)) {
      rt().display.mvcursor(winxpos + astring.length, winypos);
      printchr(g.inchar);
      astring = astring + g.inchar;
    }
  } while (g.inchar !== chr(CRETURN));

  return astring;
}


/** GETCHARX. Asks which party member, by number; a bare return means none and answers -1. */
export async function getcharx(dspnames: boolean, solicit: string): Promise<number> {
  gotoxy(0, 18);
  write(chr(11));

  if (dspnames) {
    for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
      gotoxy(20 * (g.llbase04 % 2), 20 + Math.floor(g.llbase04 / 2));
      write([ g.llbase04 + 1, 1 ], ') ', g.charactr[g.llbase04].name);
    }
  }

  do {
    gotoxy(0, 18);
    write(chr(29), solicit, ' ([RETURN] EXITS) >');
    await getkey();
    g.llbase04 = ord(g.inchar) - ord('0');
  } while (!(((g.llbase04 > 0) && (g.llbase04 <= g.partycnt)) || (g.inchar === chr(13))));

  if (g.inchar === chr(CRETURN)) {
    g.llbase04 = 0;
  }

  return g.llbase04 - 1;
}


/** An empty FOR loop of this many passes on the real machine, which is how the game paced itself. */
export async function pause(passes: number): Promise<void> {
  await rt().clock.sleep(passes * MILLISECONDS_PER_LOOP);
}


/** PAUSE1. FOR I := 0 TO TIMEDLAY DO nothing, which is what T)ime in the maze sets the length of. */
export async function pause1(): Promise<void> {
  await pause(g.timedlay + 1);
}


/**
 * PAUSE2. A fixed loop, so unlike PAUSE1 the maze's T)ime does not shorten it and nothing else can
 * either: every wait this is behind - the chant, the surprise, the trap and reward messages - is one
 * the player sits through.
 */
export async function pause2(): Promise<void> {
  await pause(3001);
}


/** CENTSTR. Centres a line of text on the bottom row, parks the cursor, and holds it there. */
export async function centstr(astring: string): Promise<void> {
  gotoxy(20 - Math.floor(astring.length / 2), 23);
  write(astring);
  gotoxy(41, 0);
  await pause2();
}


export function graphics(): void {
  rt().display.mvcursor(40, 0);
}


export function textmode(): void {
  rt().display.mvcursor(50, 0);
}


export function clearpic(): void {
  rt().display.hires.clrpict(0, 0, 0, 100);
}


export function printchr(achar: string): void {
  rt().display.hires.prgrchr(rt().display.charset.glyph(achar));
}


export function printstr(astring: string): void {
  for (const character of astring) {
    printchr(character);
  }
}


/** PRINTNUM. Right-justifies a number in a field of at most five glyphs on the hi-res screen. */
export function printnum(anum: number, fieldsz: number): void {
  let value: number = (anum < 0) ? 0 : anum;
  const width: number = Math.min(5, Math.max(1, fieldsz));
  const digits: string[] = new Array<string>(6).fill(' ');

  for (let digitx: number = 5; digitx >= 1; digitx--) {
    digits[digitx] = chr(48 + (value % 10));
    value = Math.floor(value / 10);
  }

  let digitx: number = 1;

  while ((digitx < 5) && (digits[digitx] === chr(48))) {
    digits[digitx] = chr(32);
    digitx = digitx + 1;
  }

  for (let index: number = 6 - width; index <= 5; index++) {
    printchr(digits[index]);
  }
}


// The twelve-digit decimal numbers gold and experience are kept in: three words of four decimal
// digits. Arithmetic saturates rather than wrapping - which is how 9999999999 stays put - and is
// done a digit at a time, so it is ported as it was written rather than rebuilt on JavaScript
// numbers that would round differently at the top of the range.

export function newlong(low: number = 0, mid: number = 0, high: number = 0): ITwizlong {
  return { low, mid, high };
}


export function copylong(from: ITwizlong): ITwizlong {
  return { low: from.low, mid: from.mid, high: from.high };
}


export function addlongs(first: ITwizlong, second: ITwizlong): void {
  first.low = first.low + second.low;

  if (first.low >= 10000) {
    first.mid = first.mid + 1;
    first.low = first.low - 10000;
  }

  first.mid = first.mid + second.mid;

  if (first.mid >= 10000) {
    first.high = first.high + 1;
    first.mid = first.mid - 10000;
  }

  first.high = first.high + second.high;

  if (first.high >= 10000) {
    first.high = 9999;
    first.mid = 9999;
    first.low = 9999;
  }
}


export function sublongs(first: ITwizlong, second: ITwizlong): void {
  first.low = first.low - second.low;

  if (first.low < 0) {
    first.mid = first.mid - 1;
    first.low = first.low + 10000;
  }

  first.mid = first.mid - second.mid;

  if (first.mid < 0) {
    first.high = first.high - 1;
    first.mid = first.mid + 10000;
  }

  first.high = first.high - second.high;

  if (first.high < 0) {
    first.high = 0;
    first.mid = 0;
    first.low = 0;
  }
}


export function long2bcd(longnum: ITwizlong): Tbcd {
  const bcdnum: Tbcd = new Array<number>(BCD_DIGITS).fill(0);
  let digitx: number = 1;

  function int2bcd(partlong: number): void {
    let remaining: number = partlong;

    function putdigit(powof10: number): void {
      // Pascal's DIV truncates towards zero, which is not what Math.floor does for a negative word -
      // and a negative one does reach here, out of arithmetic that saturates rather than borrowing.
      bcdnum[digitx] = Math.trunc(remaining / powof10);
      digitx = digitx + 1;
      remaining = remaining % powof10;
    }

    putdigit(1000);
    putdigit(100);
    putdigit(10);
    putdigit(1);
  }

  bcdnum[0] = 0;
  int2bcd(longnum.high);
  int2bcd(longnum.mid);
  int2bcd(longnum.low);

  return bcdnum;
}


export function bcd2long(longnum: ITwizlong, bcdnum: Tbcd): void {
  let digitx: number = 1;

  function bcd2int(): number {
    let longpart: number = 0;

    for (let index: number = 0; index < 4; index++) {
      longpart = (10 * longpart) + bcdnum[digitx];
      digitx = digitx + 1;
    }

    return longpart;
  }

  longnum.low = 0;
  longnum.mid = 0;
  longnum.high = 0;
  longnum.high = bcd2int();
  longnum.mid = bcd2int();
  longnum.low = bcd2int();
}


export function multlong(longnum: ITwizlong, intnum: number): void {
  const bcdnum: Tbcd = long2bcd(longnum);

  for (let digitx: number = 12; digitx >= 1; digitx--) {
    bcdnum[digitx] = bcdnum[digitx] * intnum;
  }

  for (let digitx: number = 12; digitx >= 1; digitx--) {
    if (bcdnum[digitx] > 9) {
      bcdnum[digitx - 1] = bcdnum[digitx - 1] + Math.floor(bcdnum[digitx] / 10);
      bcdnum[digitx] = bcdnum[digitx] % 10;
    }
  }

  bcd2long(longnum, bcdnum);
}


export function divlong(longnum: ITwizlong, intnum: number): void {
  const bcdnum: Tbcd = long2bcd(longnum);

  for (let digitx: number = 1; digitx <= 12; digitx++) {
    const nxtdigit: number = Math.floor(bcdnum[digitx] / intnum);

    bcdnum[digitx + 1] = bcdnum[digitx + 1] + (10 * (bcdnum[digitx] - (nxtdigit * intnum)));
    bcdnum[digitx] = nxtdigit;
  }

  bcd2long(longnum, bcdnum);
}


/** TESTLONG. -1, 0 or 1 as FIRST is below, equal to, or above SECOND. */
export function testlong(first: ITwizlong, second: ITwizlong): number {
  let testlong_: number = 0;

  withExitSync('TESTLONG', (): void => {
    function lteqgt(firstx: number, secondx: number): void {
      withExitSync('LTEQGT', (): void => {
        if (firstx === secondx) {
          exit('LTEQGT');
        } else {
          testlong_ = (firstx > secondx) ? 1 : -1;
        }

        exit('TESTLONG');
      });
    }

    lteqgt(first.high, second.high);
    lteqgt(first.mid, second.mid);
    lteqgt(first.low, second.low);
    testlong_ = 0;
  });

  return testlong_;
}


/** PRNTLONG. Twelve digits with the leading zeroes written as spaces. */
export function prntlong(longnum: ITwizlong): void {
  const bcdnum: Tbcd = long2bcd(longnum);
  let leadspcx: number = 1;

  while ((leadspcx < 12) && (bcdnum[leadspcx] === 0)) {
    leadspcx = leadspcx + 1;
    write(' ');
  }

  for (let nonspcx: number = leadspcx; nonspcx <= 12; nonspcx++) {
    write([ bcdnum[nonspcx], 1 ]);
  }
}
