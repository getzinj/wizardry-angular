import { describe, expect, it } from 'vitest';

import {
  BACKSPACE, BELL, CLEAR_SCREEN, CLEAR_TO_END_OF_LINE, CLEAR_TO_END_OF_SCREEN, RETURN, TextScreen
} from './text-screen';


function screenWith(text: string): TextScreen {
  const screen: TextScreen = new TextScreen();

  screen.write(text);

  return screen;
}


describe('writing to the text screen', (): void => {
  it('starts blank', (): void => {
    expect(new TextScreen().toString().trim()).toBe('');
  });

  it('puts text where the cursor is', (): void => {
    expect(screenWith('GILGAMESH').line(0)).toBe('GILGAMESH'.padEnd(40));
  });

  it('writes from wherever the cursor was moved to', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(5, 3);
    screen.write('INN');

    expect(screen.line(3)).toBe('     INN'.padEnd(40));
  });

  it('leaves the cursor after what it wrote', (): void => {
    expect(screenWith('ABC').cursorColumn).toBe(3);
  });

  it('wraps to the next row at the right-hand edge', (): void => {
    expect(screenWith('X'.repeat(41)).line(1)).toBe('X'.padEnd(40));
  });

  it('scrolls what is on screen up when it runs off the bottom', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(0, 23);
    screen.writeln('BOTTOM');

    expect(screen.line(22)).toBe('BOTTOM'.padEnd(40));
  });

  it('stays on the last row after scrolling', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(0, 23);
    screen.writeln('BOTTOM');

    expect(screen.cursorRow).toBe(23);
  });

  it('ends a line and starts the next one', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.writeln('FIRST');
    screen.write('SECOND');

    expect(screen.line(1)).toBe('SECOND'.padEnd(40));
  });
});


describe('the control characters the game writes', (): void => {
  it('erases the whole screen', (): void => {
    expect(screenWith('SOMETHING' + CLEAR_SCREEN).toString().trim()).toBe('');
  });

  it('puts the cursor back in the corner when it erases the screen', (): void => {
    const screen: TextScreen = screenWith('SOMETHING' + CLEAR_SCREEN);

    expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 0]);
  });

  it('erases from the cursor to the end of the line', (): void => {
    const screen: TextScreen = screenWith('KEEPTHROWAWAY');

    screen.gotoxy(4, 0);
    screen.write(CLEAR_TO_END_OF_LINE);

    expect(screen.line(0).trim()).toBe('KEEP');
  });

  it('leaves later rows alone when erasing to the end of a line', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(0, 1);
    screen.write('BELOW');
    screen.gotoxy(0, 0);
    screen.write(CLEAR_TO_END_OF_LINE);

    expect(screen.line(1).trim()).toBe('BELOW');
  });

  it('leaves the cursor where it was when erasing to the end of a line', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(4, 0);
    screen.write(CLEAR_TO_END_OF_LINE);

    expect(screen.cursorColumn).toBe(4);
  });

  it('erases from the cursor to the bottom of the screen', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(0, 5);
    screen.write('GONE');
    screen.gotoxy(0, 3);
    screen.write(CLEAR_TO_END_OF_SCREEN);

    expect(screen.line(5).trim()).toBe('');
  });

  it('erases the rest of the cursor row when erasing to the bottom', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.write('KEEPGONE');
    screen.gotoxy(4, 0);
    screen.write(CLEAR_TO_END_OF_SCREEN);

    expect(screen.line(0).trim()).toBe('KEEP');
  });

  it('leaves earlier rows alone when erasing to the bottom', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.write('KEPT');
    screen.gotoxy(0, 3);
    screen.write(CLEAR_TO_END_OF_SCREEN);

    expect(screen.line(0).trim()).toBe('KEPT');
  });

  it('moves the cursor back on a backspace', (): void => {
    expect(screenWith('AB' + BACKSPACE).cursorColumn).toBe(1);
  });

  it('will not back the cursor off the left edge', (): void => {
    expect(screenWith(BACKSPACE + BACKSPACE).cursorColumn).toBe(0);
  });

  it('counts a bell instead of printing it', (): void => {
    expect(screenWith(BELL + BELL).bells).toBe(2);
  });

  it('prints nothing for a bell', (): void => {
    expect(screenWith(BELL).line(0).trim()).toBe('');
  });

  it('returns to the start of the next line', (): void => {
    expect(screenWith('ABC' + RETURN + 'D').line(1)).toBe('D'.padEnd(40));
  });
});


describe('the cursor parked off the screen', (): void => {
  // The game writes GOTOXY(41, 0) before waiting for a key, to hide the cursor.
  it('accepts a column past the right-hand edge', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(41, 0);

    expect(screen.cursorColumn).toBe(41);
  });

  it('puts nothing on the screen while parked there', (): void => {
    const screen: TextScreen = new TextScreen();

    screen.gotoxy(41, 0);
    screen.write('X');

    expect(screen.toString().trim()).toBe('');
  });
});
