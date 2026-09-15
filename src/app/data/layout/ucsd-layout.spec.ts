import { describe, expect, it } from 'vitest';

import type { ILayout } from './ucsd-layout';
import { array, boolean, integer, packedArray, packedGrid, record, string, wizardryLong } from './ucsd-layout';
import { character } from './wiz-types';

// Writing has to be the exact inverse of reading, or a saved character comes back as somebody
// else. It also has to leave alone everything it does not own: the game wrote records back over
// the disk it read them from, so anything this touches gratuitously is a change to the player's
// own disk that nobody asked for.


function buffer(size: number, fill: number = 0): Uint8Array {
  return new Uint8Array(size).fill(fill);
}


describe('reading back what was written', (): void => {
  it('returns an integer unchanged', (): void => {
    const layout: ILayout<number> = integer();
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, 12345);

    expect(layout.read(bytes, 0)).toBe(12345);
  });

  it('returns a negative integer unchanged', (): void => {
    const layout: ILayout<number> = integer();
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, -2);

    expect(layout.read(bytes, 0)).toBe(-2);
  });

  it('returns a boolean unchanged', (): void => {
    const layout: ILayout<boolean> = boolean();
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, true);

    expect(layout.read(bytes, 0)).toBe(true);
  });

  it('returns a string unchanged', (): void => {
    const layout: ILayout<string> = string(15);
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, 'FRODO');

    expect(layout.read(bytes, 0)).toBe('FRODO');
  });

  it('returns a full-length string unchanged', (): void => {
    const layout: ILayout<string> = string(15);
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, 'ABCDEFGHIJKLMNO');

    expect(layout.read(bytes, 0)).toBe('ABCDEFGHIJKLMNO');
  });

  it('returns a packed array unchanged', (): void => {
    const layout: ILayout<number[]> = packedArray(6, 5);
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, [18, 3, 17, 0, 9, 12]);

    expect(layout.read(bytes, 0)).toEqual([18, 3, 17, 0, 9, 12]);
  });

  it('returns a packed grid unchanged', (): void => {
    const layout: ILayout<number[][]> = packedGrid(2, 20, 2);
    const bytes: Uint8Array = buffer(layout.size);
    const grid: number[][] = [
      Array.from({ length: 20 }, (_: unknown, index: number): number => index % 4),
      Array.from({ length: 20 }, (_: unknown, index: number): number => (index + 2) % 4),
    ];

    layout.write(bytes, 0, grid);

    expect(layout.read(bytes, 0)).toEqual(grid);
  });

  it('returns a long unchanged', (): void => {
    const layout: ILayout<{ low: number; mid: number; high: number }> = wizardryLong();
    const bytes: Uint8Array = buffer(layout.size);

    layout.write(bytes, 0, { low: 9999, mid: 1234, high: 7 });

    expect(layout.read(bytes, 0)).toEqual({ low: 9999, mid: 1234, high: 7 });
  });

  it('returns an array of records unchanged', (): void => {
    const layout: ILayout<{ a: number; b: boolean }[]> = array(3, record({ a: integer(), b: boolean() }));
    const bytes: Uint8Array = buffer(layout.size);
    const values: { a: number; b: boolean }[] = [{ a: 1, b: true }, { a: 2, b: false }, { a: 3, b: true }];

    layout.write(bytes, 0, values);

    expect(layout.read(bytes, 0)).toEqual(values);
  });

  it('returns a whole character unchanged', (): void => {
    const bytes: Uint8Array = buffer(character.size);
    const before: ReturnType<typeof character.read> = character.read(bytes, 0);
    const edited: ReturnType<typeof character.read> = {
      ...before,
      name: 'FRODO',
      level: 7,
      hitPoints: 23,
      attributes: [18, 11, 9, 14, 12, 8],
      gold: { low: 1234, mid: 5, high: 0 },
    };

    character.write(bytes, 0, edited);

    expect(character.read(bytes, 0)).toEqual(edited);
  });
});


describe('writing back what was read', (): void => {
  it('leaves a character byte for byte as it was found', (): void => {
    // The player's disk should come back identical if nothing about the character changed.
    const bytes: Uint8Array = buffer(character.size);
    const filled: ReturnType<typeof character.read> = {
      ...character.read(bytes, 0),
      name: 'GANDALF',
      password: 'MELLON',
      level: 13,
      attributes: [18, 18, 3, 12, 7, 15],
    };

    character.write(bytes, 0, filled);

    const copy: Uint8Array = bytes.slice();

    character.write(bytes, 0, character.read(bytes, 0));

    expect([...bytes]).toEqual([...copy]);
  });
});


describe('writing only what the field owns', (): void => {
  it('leaves the bytes after a name as they were, as Pascal did', (): void => {
    // Assigning a shorter name moved the length byte and the characters and left the tail alone.
    const layout: ILayout<string> = string(15);
    const bytes: Uint8Array = buffer(layout.size, 0xEE);

    layout.write(bytes, 0, 'AB');

    expect(bytes[8]).toBe(0xEE);
  });

  it('leaves the padding bits of a packed array alone', (): void => {
    // Fifty one-bit values take fifty of the four words' sixty-four bits. The last two land in
    // byte 6, so the whole of byte 7 is padding and none of it is ours to clear.
    const layout: ILayout<number[]> = packedArray(50, 1);
    const bytes: Uint8Array = buffer(layout.size, 0xFF);

    layout.write(bytes, 0, new Array<number>(50).fill(0));

    expect(bytes[7]).toBe(0xFF);
  });

  it('clears the bits of a packed array that are ours', (): void => {
    const layout: ILayout<number[]> = packedArray(50, 1);
    const bytes: Uint8Array = buffer(layout.size, 0xFF);

    layout.write(bytes, 0, new Array<number>(50).fill(0));

    expect(bytes[6]).toBe(0xFC);
  });

  it('leaves a neighbouring field untouched', (): void => {
    const pair: ILayout<{ first: number; second: number }> = record({ first: integer(), second: integer() });
    const bytes: Uint8Array = buffer(pair.size);

    pair.write(bytes, 0, { first: 0x1234, second: 0x5678 });
    integer().write(bytes, 0, 0);

    expect(integer().read(bytes, 2)).toBe(0x5678);
  });

  it('writes nothing outside the record it was given', (): void => {
    const bytes: Uint8Array = buffer(character.size + 4, 0xAA);

    character.write(bytes, 0, character.read(bytes, 0));

    expect([...bytes.subarray(character.size)]).toEqual([0xAA, 0xAA, 0xAA, 0xAA]);
  });
});


describe('a length byte larger than the field it sits in', (): void => {
  // Only possible on a disk the original did not write: every place it stores a string caps the
  // length first. Reading no further than the field is what keeps read and write inverse.
  const overlong: ILayout<string> = string(4);

  function spoiltField(): Uint8Array {
    const bytes: Uint8Array = new Uint8Array(16).fill(0x41);

    bytes[0] = 12;

    return bytes;
  }

  it('reads no further than the field', (): void => {
    expect(overlong.read(spoiltField(), 0)).toBe('AAAA');
  });

  it('writes back what it read', (): void => {
    const bytes: Uint8Array = spoiltField();

    overlong.write(bytes, 0, overlong.read(bytes, 0));

    expect(overlong.read(bytes, 0)).toBe('AAAA');
  });
});
