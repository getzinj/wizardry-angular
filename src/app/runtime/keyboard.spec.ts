import { describe, expect, it } from 'vitest';

import { appleKeyOf, BACKSPACE_KEY, ESCAPE_KEY, Keyboard, RETURN_KEY } from './keyboard';
import { Random } from './random';


describe('translating a browser key to what the Apple II would have sent', (): void => {
  it('sends a letter in upper case, the only case the machine had', (): void => {
    expect(appleKeyOf('a')).toBe('A');
  });

  it('leaves a digit alone', (): void => {
    expect(appleKeyOf('7')).toBe('7');
  });

  it('sends a carriage return for Enter', (): void => {
    expect(appleKeyOf('Enter')).toBe(RETURN_KEY);
  });

  it('sends a backspace for Backspace', (): void => {
    expect(appleKeyOf('Backspace')).toBe(BACKSPACE_KEY);
  });

  it('sends a backspace for the left arrow, which is what that key was', (): void => {
    expect(appleKeyOf('ArrowLeft')).toBe(BACKSPACE_KEY);
  });

  it('sends an escape for Escape', (): void => {
    expect(appleKeyOf('Escape')).toBe(ESCAPE_KEY);
  });

  it('has nothing to send for a key the machine had not got', (): void => {
    expect(appleKeyOf('F5')).toBeNull();
  });
});


describe('reading a key', (): void => {
  it('returns a key that was already waiting', async (): Promise<void> => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.push('A');

    await expect(keyboard.getkey()).resolves.toBe('A');
  });

  it('returns keys in the order they were pressed', async (): Promise<void> => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.push('A');
    keyboard.push('B');
    await keyboard.getkey();

    await expect(keyboard.getkey()).resolves.toBe('B');
  });

  it('waits for a key that has not been pressed yet', async (): Promise<void> => {
    const keyboard: Keyboard = new Keyboard();
    const pressed: Promise<string> = keyboard.getkey();

    keyboard.push('Z');

    await expect(pressed).resolves.toBe('Z');
  });

  it('says when a key is waiting', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.push('A');

    expect(keyboard.keypress()).toBe(true);
  });

  it('says when no key is waiting', (): void => {
    expect(new Keyboard().keypress()).toBe(false);
  });

  it('queues a key event it understands', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.pushKey('q');

    expect(keyboard.keypress()).toBe(true);
  });

  it('ignores a key event it does not understand', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.pushKey('Shift');

    expect(keyboard.keypress()).toBe(false);
  });
});


describe('flushing the type-ahead buffer', (): void => {
  it('drops keys that were pressed ahead of the prompt', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.push('A');
    keyboard.unitclear();

    expect(keyboard.keypress()).toBe(false);
  });
});


describe('stirring the random number while waiting', (): void => {
  // MVCURSOR( 80, 0) increments the generator's state on every pass of its polling loop, so how
  // long the player took to answer is the only entropy the game ever gets.
  function keyboardAt(clock: { value: number }): { keyboard: Keyboard; random: Random } {
    const random: Random = new Random(1);
    const keyboard: Keyboard = new Keyboard(random, (): number => clock.value);

    return { keyboard, random };
  }

  it('stirs by how long the player took', async (): Promise<void> => {
    const clock: { value: number } = { value: 0 };
    const { keyboard, random }: { keyboard: Keyboard; random: Random } = keyboardAt(clock);
    const unstirred: number = new Random(1).next();
    const pressed: Promise<string> = keyboard.getkey();

    clock.value = 50;
    keyboard.push('A');
    await pressed;

    expect(random.next()).not.toBe(unstirred);
  });

  it('stirs nothing for a key already in the buffer, as the original did not', async (): Promise<void> => {
    const clock: { value: number } = { value: 0 };
    const { keyboard, random }: { keyboard: Keyboard; random: Random } = keyboardAt(clock);

    keyboard.push('A');
    clock.value = 50;
    await keyboard.getkey();

    expect(random.next()).toBe(new Random(1).next());
  });
});


describe('knowing whether the game is waiting for a key', (): void => {
  it('is not waiting before anything asks', (): void => {
    expect(new Keyboard().waiting).toBe(false);
  });

  it('is waiting once a read has found nothing', async (): Promise<void> => {
    const keyboard: Keyboard = new Keyboard();
    const pressed: Promise<string> = keyboard.getkey();

    expect(keyboard.waiting).toBe(true);

    keyboard.push('A');
    await pressed;
  });

  it('stops waiting once the key arrives', async (): Promise<void> => {
    const keyboard: Keyboard = new Keyboard();
    const pressed: Promise<string> = keyboard.getkey();

    keyboard.push('A');
    await pressed;

    expect(keyboard.waiting).toBe(false);
  });

  it('is not waiting when a key was already there', async (): Promise<void> => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.push('A');
    await keyboard.getkey();

    expect(keyboard.waiting).toBe(false);
  });
});
