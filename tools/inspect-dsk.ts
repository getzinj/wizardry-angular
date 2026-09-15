// Runs the same checks the app runs when a player hands it a disk, from the command line.
//
// Useful for answering "is this the right disk?" without opening a browser, and for seeing the
// exact message a player would get. It writes nothing: the game's data belongs to whoever owns
// the game, and the app keeps its copy in the player's own browser.
//
//   npx nx run wizardry:inspect-dsk --args="--dsk <path to disk image>"

import { readFileSync } from 'node:fs';

import type { ScenarioImportResult } from '../src/app/data/scenario-import';
import { importScenarioDisk } from '../src/app/data/scenario-import';


function diskPath(argv: readonly string[]): string {
  const index: number = argv.indexOf('--dsk');

  if ((index < 0) || (argv[index + 1] == null)) {
    throw new Error('usage: inspect-dsk --dsk <disk image>');
  }

  return argv[index + 1];
}


function main(): void {
  const path: string = diskPath(process.argv.slice(2));
  const result: ScenarioImportResult = importScenarioDisk(new Uint8Array(readFileSync(path)));

  if (result.ok) {
    const { summary } = result.files;

    console.log(`\n${ path }`);
    console.log(`  accepted: ${ summary.gameName }`);
    console.log(`  volume ${ summary.volumeName }, ${ summary.sectorOrder } sector order`);
    console.log(`  ${ summary.mazeLevels } maze levels, ${ summary.monsters } monsters, ` +
                `${ summary.items } items, room for ${ summary.rosterSize } characters`);
    console.log(`  scenario data ${ result.files.scenarioData.length } bytes, ` +
                `messages ${ result.files.scenarioMessages?.length ?? 0 } bytes`);
  } else {
    console.log(`\n${ path }`);
    console.log(`  rejected (${ result.problem }): ${ result.message }`);
    result.detail.forEach((line: string): void => console.log(`  ${ line }`));
    process.exitCode = 1;
  }
}


main();
