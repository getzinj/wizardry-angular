import { describe, expect, it } from 'vitest';

import { BLOCK_SIZE, STANDARD_IMAGE_SIZE } from './dsk/dsk-image';
import { MESSAGE_BLOCKS, SCENARIO_BLOCKS, buildDisk, buildScenarioDisk, writeWord } from './scenario-fixture';
import type { ScenarioImportResult } from './scenario-import';
import { importScenarioDisk } from './scenario-import';

// The disks these use are built in scenario-fixture.ts, so none of this needs the game's own data.

function problemOf(result: ScenarioImportResult): string {
  return result.ok ? 'accepted' : result.problem;
}


describe('importScenarioDisk, given a scenario disk', (): void => {
  it('accepts it', (): void => {
    expect(importScenarioDisk(buildScenarioDisk()).ok).toBe(true);
  });

  it('reports the scenario name', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(buildScenarioDisk('A TEST SCENARIO'));

    expect(result.ok && result.files.summary.gameName).toBe('A TEST SCENARIO');
  });

  it('reports how many maze levels it holds', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(buildScenarioDisk());

    expect(result.ok && result.files.summary.mazeLevels).toBe(2);
  });

  it('keeps the whole scenario file', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(buildScenarioDisk());

    expect(result.ok && result.files.scenarioData.length).toBe(SCENARIO_BLOCKS * BLOCK_SIZE);
  });

  it('keeps the messages file alongside it', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(buildScenarioDisk());

    expect(result.ok && result.files.scenarioMessages?.length).toBe(MESSAGE_BLOCKS * BLOCK_SIZE);
  });
});


describe('importScenarioDisk, given the wrong disk', (): void => {
  it('recognises the boot disk by the game code it carries', (): void => {
    const disk: Uint8Array = buildDisk('WBTEST', [
      { name: 'WIZARDRY.CODE', firstBlock: 6, blockCount: 100 },
      { name: 'SYSTEM.PASCAL', firstBlock: 106, blockCount: 30 },
    ]);

    expect(problemOf(importScenarioDisk(disk))).toBe('boot-disk');
  });

  it('says which disk is wanted instead', (): void => {
    const disk: Uint8Array = buildDisk('WBTEST', [{ name: 'WIZARDRY.CODE', firstBlock: 6, blockCount: 100 }]);
    const result: ScenarioImportResult = importScenarioDisk(disk);

    expect(!result.ok && result.message).toContain('scenario disk');
  });

  it('rejects a Pascal disk from something else entirely', (): void => {
    const disk: Uint8Array = buildDisk('OTHER', [{ name: 'PAYROLL.DATA', firstBlock: 6, blockCount: 20 }]);

    expect(problemOf(importScenarioDisk(disk))).toBe('not-a-wizardry-disk');
  });

  it('lists what that disk did hold', (): void => {
    const disk: Uint8Array = buildDisk('OTHER', [{ name: 'PAYROLL.DATA', firstBlock: 6, blockCount: 20 }]);
    const result: ScenarioImportResult = importScenarioDisk(disk);

    expect(!result.ok && result.detail.join(' ')).toContain('PAYROLL.DATA');
  });
});


describe('importScenarioDisk, given something that is not a disk', (): void => {
  it('rejects an empty file', (): void => {
    expect(problemOf(importScenarioDisk(new Uint8Array(0)))).toBe('empty');
  });

  it('rejects a file that is not a whole number of blocks', (): void => {
    expect(problemOf(importScenarioDisk(new Uint8Array(5)))).toBe('wrong-size');
  });

  it('rejects a file too small to be a disk', (): void => {
    expect(problemOf(importScenarioDisk(new Uint8Array(BLOCK_SIZE * 4)))).toBe('wrong-size');
  });

  it('names the 2MG container rather than failing obscurely', (): void => {
    const image: Uint8Array = new Uint8Array(STANDARD_IMAGE_SIZE);

    image.set([...'2IMG'].map((character: string): number => character.charCodeAt(0)), 0);

    expect(problemOf(importScenarioDisk(image))).toBe('unsupported-format');
  });

  it('names the WOZ container too', (): void => {
    const image: Uint8Array = new Uint8Array(STANDARD_IMAGE_SIZE);

    image.set([...'WOZ2'].map((character: string): number => character.charCodeAt(0)), 0);

    expect(problemOf(importScenarioDisk(image))).toBe('unsupported-format');
  });

  it('rejects a file of the right size holding no directory', (): void => {
    expect(problemOf(importScenarioDisk(new Uint8Array(STANDARD_IMAGE_SIZE).fill(0xE5)))).toBe('not-a-pascal-disk');
  });
});


describe('importScenarioDisk, given a damaged scenario', (): void => {
  it('rejects one with no name', (): void => {
    expect(problemOf(importScenarioDisk(buildScenarioDisk('')))).toBe('damaged-scenario');
  });

  it('rejects one whose sections run past the end of the file', (): void => {
    const disk: Uint8Array = buildScenarioDisk('A TEST SCENARIO', (image: Uint8Array, toc: number): void => {
      writeWord(image, toc + 90 + (7 * 2), 900);
    });

    expect(problemOf(importScenarioDisk(disk))).toBe('damaged-scenario');
  });

  it('rejects one whose records are laid out differently', (): void => {
    const disk: Uint8Array = buildScenarioDisk('A TEST SCENARIO', (image: Uint8Array, toc: number): void => {
      // Claiming forty characters to a block pair contradicts a 208-byte character record.
      writeWord(image, toc + 42 + (5 * 2), 40);
    });

    expect(problemOf(importScenarioDisk(disk))).toBe('damaged-scenario');
  });
});
