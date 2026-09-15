import { describe, expect, it } from 'vitest';

import { character, experienceTable, maze, monster, object, scenarioToc } from './wiz-types';
import { packedArray, packedGrid, string } from './ucsd-layout';

// Record sizes are the one thing about this file format that can be checked without the data:
// the disk says how many records it packs into each pair of blocks, so a record whose computed
// size does not fit that count is wrong. These are the sizes that satisfy the counts on a real
// scenario disk, and the extractor re-checks them against whatever disk it is given.
const BLOCK_PAIR_BYTES: number = 1024;


describe('record sizes', (): void => {
  it('makes a character 208 bytes, four to a block pair', (): void => {
    expect(character.size).toBe(208);
  });

  it('makes an item 78 bytes, thirteen to a block pair', (): void => {
    expect(object.size).toBe(78);
  });

  it('makes a monster 158 bytes, six to a block pair', (): void => {
    expect(monster.size).toBe(158);
  });

  it('makes a maze level 894 bytes, one to a block pair', (): void => {
    expect(maze.size).toBe(894);
  });

  it('keeps the experience table inside a block pair', (): void => {
    expect(experienceTable.size).toBeLessThanOrEqual(BLOCK_PAIR_BYTES);
  });
});


describe('records fit the counts the disk packs into a block pair', (): void => {
  it('fits four characters', (): void => {
    expect(character.size * 4).toBeLessThanOrEqual(BLOCK_PAIR_BYTES);
  });

  it('does not fit a fifth', (): void => {
    expect(character.size * 5).toBeGreaterThan(BLOCK_PAIR_BYTES);
  });

  it('fits thirteen items', (): void => {
    expect(object.size * 13).toBeLessThanOrEqual(BLOCK_PAIR_BYTES);
  });

  it('does not fit a fourteenth', (): void => {
    expect(object.size * 14).toBeGreaterThan(BLOCK_PAIR_BYTES);
  });

  it('fits six monsters', (): void => {
    expect(monster.size * 6).toBeLessThanOrEqual(BLOCK_PAIR_BYTES);
  });

  it('does not fit a seventh', (): void => {
    expect(monster.size * 7).toBeGreaterThan(BLOCK_PAIR_BYTES);
  });
});


describe('the table of contents', (): void => {
  // Offsets observed on a real disk, where each name table begins.
  it('starts the race names after the four zone tables', (): void => {
    expect(scenarioToc.offsets.raceNames).toBe(106);
  });

  it('starts the class names after the six race names', (): void => {
    expect(scenarioToc.offsets.classNames).toBe(166);
  });

  it('starts the status names after the eight class names', (): void => {
    expect(scenarioToc.offsets.statusNames).toBe(246);
  });
});


describe('layout rules', (): void => {
  it('rounds a string up to a whole number of words', (): void => {
    expect(string(8).size).toBe(10);
  });

  it('leaves an already even string alone', (): void => {
    expect(string(15).size).toBe(16);
  });

  it('packs three five-bit values into a word', (): void => {
    expect(packedArray(3, 5).size).toBe(2);
  });

  it('starts a new word rather than splitting a value across one', (): void => {
    expect(packedArray(4, 5).size).toBe(4);
  });

  it('starts each row of a grid on a word', (): void => {
    expect(packedGrid(2, 20, 2).size).toBe(12);
  });

  it('reads packed values from the low bits of the word upwards', (): void => {
    // 0b...01_10 is the two-bit values 2 then 1.
    expect(packedArray(2, 2).read(new Uint8Array([0b0110, 0]), 0)).toEqual([2, 1]);
  });
});


describe('the spell the character record is one bit short of', (): void => {
  // The original declares SPELLSKN as PACKED ARRAY[ 0..49] but indexes 50 as well, which range
  // checking would have caught and which the compiler flags turned off. Bit 50 is inside the
  // field regardless, so the game has fifty-one of them.
  function withSpell(index: number): number[] {
    const bytes: Uint8Array = new Uint8Array(character.size);
    const blank: ReturnType<typeof character.read> = character.read(bytes, 0);

    blank.spellsKnown[index] = 1;
    character.write(bytes, 0, blank);

    return character.read(bytes, 0).spellsKnown;
  }

  it('has a bit for every spell, MALIKTO included', (): void => {
    expect(character.read(new Uint8Array(character.size), 0).spellsKnown).toHaveLength(51);
  });

  it('keeps the last spell over a write and a read', (): void => {
    expect(withSpell(50)[50]).toBe(1);
  });

  it('still fits a character into 208 bytes', (): void => {
    expect(character.size).toBe(208);
  });
});
