import { buildDiskImage, toVolumeName } from './dsk/dsk-writer';
import type { ISaveDisk } from './save-disks';
import { SCENARIO_DATA, SCENARIO_MESSAGES } from './scenario-import';

// Taking a save disk out of the browser, and putting one back.
//
// What comes out is a real Apple Pascal disk image rather than a format of our own, so the same
// reader that accepts the player's original disk accepts this one, and so would an emulator. That
// symmetry is the point: importing a save disk needs no separate code path, because a save disk is
// a scenario disk that has been played.


export interface IExportedDisk {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}


/** A file name that will survive whatever the player's system objects to. */
function toFileName(name: string): string {
  const cleaned: string = name.trim().replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '-');

  return `${ (cleaned.length > 0) ? cleaned : 'wizardry-save' }.dsk`;
}


/** Writes a save disk out as a disk image, carrying the scenario and its messages. */
export function exportSaveDisk(disk: ISaveDisk): IExportedDisk {
  const files: { name: string; bytes: Uint8Array }[] = [{ name: SCENARIO_DATA, bytes: disk.scenarioData }];

  if (disk.scenarioMessages !== null) {
    files.push({ name: SCENARIO_MESSAGES, bytes: disk.scenarioMessages });
  }

  return {
    fileName: toFileName(disk.name),
    bytes: buildDiskImage(toVolumeName(disk.name), files),
  };
}


/** Hands the file to the browser to save, the only part of this that needs a browser at all. */
export function offerDownload(exported: IExportedDisk): void {
  const url: string = URL.createObjectURL(new Blob([exported.bytes as BlobPart], { type: 'application/octet-stream' }));
  const link: HTMLAnchorElement = document.createElement('a');

  link.href = url;
  link.download = exported.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
