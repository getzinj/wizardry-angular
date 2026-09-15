// The disk, as the game reached it: GETREC and GETRECW, with the wait the drive cost.
//
// The scenario is whole in memory, so a read here is instant. What is not instant is the drive it
// stood in for, and ScenarioDisk.drive keeps the original's block-pair bookkeeping to say when
// that drive would have moved. Every accessor here reads or writes and then waits that time out
// on the machine's clock, so a test with an InstantClock sees what was asked for and waits for
// nothing.

import type { IDriveActivity } from '../data/block-cache-model';
import type { ILayout } from '../data/layout/ucsd-layout';
import type { Zone } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { disk, rt } from '../runtime/runtime';

/**
 * How long the Disk II took to bring a stopped disk up to speed. The real figure was about a
 * second; this is shorter, since the point is to be reminded of the wait rather than to sit
 * through it again.
 */
export const MOTOR_SPIN_UP_MILLISECONDS: number = 500;

/**
 * How long one block pair took to seek to and transfer, read or write alike. Two sectors at
 * 300 rpm plus a seek came to three or four hundred milliseconds; this too is shortened.
 */
export const MILLISECONDS_PER_BLOCK_PAIR: number = 150;

/** How long the Disk II left the motor running after its last access before switching it off. */
export const MOTOR_TIMEOUT_MILLISECONDS: number = 1000;


/** What the drive's most recent movement would have cost, in milliseconds; nothing if it sat still. */
export function drivetimeOf(activity: IDriveActivity): number {
  const transfers: number = (activity.wrote ? 1 : 0) + (activity.read ? 1 : 0);
  const spinUp: number = activity.spinUp ? MOTOR_SPIN_UP_MILLISECONDS : 0;

  return spinUp + (transfers * MILLISECONDS_PER_BLOCK_PAIR);
}


/** Runs one access against the mounted disk, then waits out whatever the drive did for it. */
async function timed<T>(access: (mounted: ScenarioDisk) => T): Promise<T> {
  const mounted: ScenarioDisk = disk();
  const value: T = access(mounted);
  const milliseconds: number = drivetimeOf(mounted.lastActivity);

  if (milliseconds > 0) {
    await rt().clock.sleep(milliseconds);
  }

  return value;
}


/** GETREC: one record. */
export function getrec<T>(zone: Zone, index: number, layout: ILayout<T>): Promise<T> {
  return timed((mounted: ScenarioDisk): T => mounted.read(zone, index, layout));
}


/** GETRECW: one record written back, which dirties its pair rather than touching the drive. */
export function putrec<T>(zone: Zone, index: number, layout: ILayout<T>, value: T): Promise<void> {
  return timed((mounted: ScenarioDisk): void => mounted.write(zone, index, layout, value));
}


/** FILLCHAR over a record and GETRECW. */
export function fillrec<T>(zone: Zone, index: number, layout: ILayout<T>): Promise<void> {
  return timed((mounted: ScenarioDisk): void => mounted.fillchar(zone, index, layout));
}


/** GETREC on a record the game walked along as bytes: the pictures. */
export function getbytes(zone: Zone, index: number, size: number): Promise<Uint8Array> {
  return timed((mounted: ScenarioDisk): Uint8Array => mounted.readRecord(zone, index, size));
}


/** UNITREAD of one block of the scenario straight into the buffer: the fonts and the spell books. */
export function getblock(block: number): Promise<Uint8Array> {
  return timed((mounted: ScenarioDisk): Uint8Array => mounted.readBlock(block));
}


/** UNITREAD of one block of the messages file. */
export function getmsgblk(block: number): Promise<Uint8Array> {
  return timed((mounted: ScenarioDisk): Uint8Array => mounted.messageBlock(block));
}


/** FINDFILE for the messages file, which walked the volume directory: a read the drive made. */
export function findfile(): Promise<boolean> {
  return timed((mounted: ScenarioDisk): boolean => {
    mounted.lastActivity = mounted.drive.rawRead();

    return mounted.hasMessages;
  });
}


/** The game has stood still long enough for the drive motor to switch itself off. */
export function restdrive(): void {
  rt().disk?.drive.rest();
}


/** INITGAME: CACHEBL := -1 and CACHEWRI := FALSE, so the cache starts empty and a dirty pair is lost. */
export function resetdrive(): void {
  rt().disk?.drive.reset();
}
