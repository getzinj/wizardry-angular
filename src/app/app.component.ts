import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { requestDurableStorage } from './data/local-database';
import type { IScenarioFiles } from './data/scenario-import';
import { TEXT_FONT_BLOCK, ScenarioDisk } from './data/scenario-disk';
import { forgetScenario, loadStoredScenario, storeScenario } from './data/scenario-storage';
import { BrowserSaveDiskStore } from './data/save-disk-store';
import type { ISaveDisk, ISaveDiskSummary, NewDiskResult } from './data/save-disks';
import { MAXIMUM_SAVE_DISKS, SaveDiskLibrary } from './data/save-disks';
import { exportSaveDisk, offerDownload } from './data/save-disk-file';
import { importScenarioDisk } from './data/scenario-import';
import type { ScenarioImportResult } from './data/scenario-import';
import { wizardry } from './port/wizardry';
import { resetglobals } from './port/wiz';
import type { IApplePalette } from './runtime/apple-palette';
import { APPLE_PALETTES, paletteByName } from './runtime/apple-palette';
import { Display } from './runtime/display';
import { createRuntime, setRuntime } from './runtime/runtime';
import type { IRuntime } from './runtime/runtime';
import { AppleScreenComponent } from './ui/apple-screen.component';
import { SaveDiskPickerComponent } from './ui/save-disk-picker.component';
import { ScenarioImportComponent } from './ui/scenario-import.component';
import { StartupStepsComponent } from './ui/startup-steps.component';
import type { IStartupProgress } from './ui/startup-steps';
import { StartupStep, currentStep } from './ui/startup-steps';

/**
 * How long a write waits before the disk is put to storage, in milliseconds. Long enough that a
 * run of record writes becomes one save, short enough that it is over before the player can do
 * anything else - they are always waiting for a key by then.
 */
const SAVE_DELAY: number = 0;

/** Where the player's monitor choice is kept, so it is still selected next time they visit. */
const PALETTE_STORAGE_KEY: string = 'wiz-palette';

/** Set once the player has said they do not need the getting-started steps any more. */
const STEPS_HIDDEN_STORAGE_KEY: string = 'wiz-steps-hidden';


function loadStoredPaletteName(): string {
  let stored: string | null;

  try {
    stored = localStorage.getItem(PALETTE_STORAGE_KEY);
  } catch {
    stored = null;
  }

  if ((stored !== null) && APPLE_PALETTES.some((palette: IApplePalette): boolean => palette.name === stored)) {
    return stored;
  } else {
    return APPLE_PALETTES[0].name;
  }
}


function loadStepsHidden(): boolean {
  try {
    return localStorage.getItem(STEPS_HIDDEN_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}


@Component({
  selector: 'wiz-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppleScreenComponent, SaveDiskPickerComponent, ScenarioImportComponent, StartupStepsComponent],
  host: {
    '(window:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onLeaving()',
    '(window:pagehide)': 'onLeaving()',
  },
  template: `
    @if (playing()) {
      <div class="screen">
        <wiz-apple-screen [screen]="display" [palette]="palette()" />
      </div>

      <div class="controls">
        <label>
          Monitor
          <select (change)="choosePalette($event)">
            @for (option of paletteOptions; track option.name) {
              <option [value]="option.name" [selected]="option.name === paletteName()">{{ option.name }}</option>
            }
          </select>
        </label>

        <span class="hint">type as you would on the machine</span>
        <button type="button" (click)="putTheDiskAway()">{{ diskName() }} &mdash; change disk</button>
      </div>
    } @else if (master(); as files) {
      <div class="startup">
        @if (showSteps()) {
          <wiz-startup-steps [progress]="progress()" (dismissed)="hideSteps()" />
        }

        <wiz-save-disk-picker [disks]="disks()"
                              [gameName]="files.summary.gameName"
                              [limit]="diskLimit"
                              (played)="onPlay($event)"
                              (created)="onCreate($event)"
                              (discarded)="onDiscard($event)"
                              (renamed)="onRename($event)"
                              (exported)="onExport($event)"
                              (restored)="onRestore($event)"
                              [restoreFailure]="restoreFailure()"
                              (reimported)="onUseAnotherScenario()" />
      </div>
    } @else if (ready()) {
      <div class="startup">
        @if (showSteps()) {
          <wiz-startup-steps [progress]="progress()" (dismissed)="hideSteps()" />
        }

        <wiz-scenario-import (imported)="onImported($event)" />
      </div>
    }
  `,
  styles: [`
    :host {
      display: grid;
      grid-template-rows: 1fr auto;
      height: 100vh;
    }

    .screen {
      min-height: 0;
    }

    /**
     * The pre-game screens take the whole window, not just the row the maze would use, and scroll
     * when the steps and a full shelf together outrun it.
     */
    .startup {
      grid-row: 1 / -1;
      display: grid;
      /* Safe centring: overflowing content starts at the top, where it can still be scrolled to. */
      align-content: safe center;
      justify-items: center;
      overflow-y: auto;
      padding: 1rem;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid #333;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .hint {
      color: #777;
    }

    button {
      margin-left: auto;
      padding: 0.3rem 0.8rem;
      border: 1px solid #555;
      background: none;
      color: inherit;
      font: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      cursor: pointer;
    }

    button:hover {
      border-color: #e0e0e0;
    }
  `],
})
export class AppComponent {
  /** The machine's two screens. Which one the canvas shows is the game's business, not the app's. */
  public readonly display: Display = new Display();

  public readonly paletteOptions: readonly IApplePalette[] = APPLE_PALETTES;
  public readonly diskLimit: number = MAXIMUM_SAVE_DISKS;

  public readonly paletteName = signal<string>(loadStoredPaletteName());
  public readonly palette = computed<IApplePalette>((): IApplePalette => paletteByName(this.paletteName()));

  /** False until the browser has been asked what it holds, so no screen flashes up first. */
  public readonly ready = signal<boolean>(false);

  /** The imported scenario, kept untouched and only ever copied to make a save disk. */
  public readonly master = signal<IScenarioFiles | null>(null);

  public readonly disks = signal<readonly ISaveDiskSummary[]>([]);

  /** Why the last attempt to take a disk image back in was refused, if it was. */
  public readonly restoreFailure = signal<string | null>(null);

  /** The disk in the drive. Null means the player is at the shelf choosing one. */
  public readonly playing = signal<ScenarioDisk | null>(null);

  public readonly diskName = signal<string>('');

  /** Whether the player has asked not to be shown the getting-started steps again. */
  public readonly stepsHidden = signal<boolean>(loadStepsHidden());

  public readonly progress = computed<IStartupProgress>((): IStartupProgress => ({
    hasMaster: this.master() !== null,
    diskCount: this.disks().length,
    // The same reading of the two stamps the shelf makes when it says 'never played'.
    everPlayed: this.disks().some((disk: ISaveDiskSummary): boolean => disk.playedAt !== disk.createdAt),
  }));

  /**
   * The steps stand down of their own accord once the player has played, so someone coming back to
   * a shelf they already know is not told again how to use it.
   */
  public readonly showSteps = computed<boolean>((): boolean =>
    !this.stepsHidden() && (currentStep(this.progress()) !== StartupStep.done));

  private readonly library: SaveDiskLibrary = new SaveDiskLibrary(new BrowserSaveDiskStore());
  private inDrive: ISaveDisk | null = null;
  private machine: IRuntime | null = null;
  private pendingSave: ReturnType<typeof setTimeout> | undefined;
  private saving: boolean = false;


  constructor() {
    void this.restore();
  }


  public onImported(files: IScenarioFiles): void {
    this.master.set(files);
    void storeScenario(files);
    void requestDurableStorage();
    void this.refreshShelf();
  }


  public onCreate(name: string): void {
    void this.create(name);
  }


  public onPlay(id: string): void {
    void this.play(id);
  }


  public onDiscard(id: string): void {
    void this.library.remove(id).then((): Promise<void> => this.refreshShelf());
  }


  /** Writes a disk out as a real disk image, which this app and an emulator can both read. */
  public onExport(id: string): void {
    void this.library.read(id).then((disk: ISaveDisk | null): void => {
      if (disk !== null) {
        offerDownload(exportSaveDisk(disk));
      }
    });
  }


  /** Takes a disk image back in as a save disk. An exported one is a scenario disk like any other. */
  public onRestore(file: File): void {
    void this.restore_(file);
  }


  public onRename(change: { id: string; name: string }): void {
    void this.library.rename(change.id, change.name).then((): Promise<void> => this.refreshShelf());
  }


  private async restore_(file: File): Promise<void> {
    this.restoreFailure.set(null);

    if (await this.library.isFull()) {
      this.restoreFailure.set(`There is room for ${ this.diskLimit } character disks. Discard one first.`);
    } else {
      const result: ScenarioImportResult = importScenarioDisk(new Uint8Array(await file.arrayBuffer()));

      if (result.ok) {
        await this.library.createFromScenario(result.files.scenarioData,
                                              result.files.scenarioMessages,
                                              result.files.summary.gameName,
                                              file.name.replace(/\.[^.]+$/, ''));
        await this.refreshShelf();
      } else {
        this.restoreFailure.set(result.message);
      }
    }
  }


  public onUseAnotherScenario(): void {
    // Save disks are whole copies, so they survive this: they belong to no master.
    this.master.set(null);
    void forgetScenario();
  }


  public putTheDiskAway(): void {
    void this.stopPlaying();
  }


  public hideSteps(): void {
    this.stepsHidden.set(true);

    try {
      localStorage.setItem(STEPS_HIDDEN_STORAGE_KEY, 'yes');
    } catch {
      // Not remembering is better than refusing to hide them now.
    }
  }


  public choosePalette(event: Event): void {
    const name: string = (event.target as HTMLSelectElement).value;

    this.paletteName.set(name);
    this.display.dirty = true;

    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, name);
    } catch {
      // Not remembering the choice is better than refusing to apply it.
    }
  }


  /**
   * The tab is going away, or being hidden, which is the last chance to write the disk down. A
   * save already waiting on its timer will not get one, so it is taken now.
   */
  public onLeaving(): void {
    if (document.visibilityState === 'hidden') {
      clearTimeout(this.pendingSave);
      this.pendingSave = undefined;
      void this.save();
    }
  }


  /** Every keystroke goes to the machine's keyboard; the game decides what any of them mean. */
  public onKey(event: KeyboardEvent): void {
    if ((this.machine !== null) && this.machine.keyboard.pushKey(event.key)) {
      event.preventDefault();
    }
  }


  private async restore(): Promise<void> {
    this.master.set(await loadStoredScenario());
    await this.refreshShelf();
    this.ready.set(true);
  }


  private async refreshShelf(): Promise<void> {
    this.disks.set(await this.library.list());
  }


  private async create(name: string): Promise<void> {
    const files: IScenarioFiles | null = this.master();

    if (files !== null) {
      const chosen: string = name.trim() || await this.library.suggestName();
      const result: NewDiskResult = await this.library.createFromScenario(files.scenarioData,
                                                                         files.scenarioMessages,
                                                                         files.summary.gameName,
                                                                         chosen);

      await this.refreshShelf();

      if (result.ok) {
        await this.play(result.disk.id);
      }
    }
  }


  private async play(id: string): Promise<void> {
    const disk: ISaveDisk | null = await this.library.read(id);

    if (disk !== null) {
      const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData, disk.scenarioMessages);

      this.inDrive = disk;
      this.diskName.set(disk.name);
      // PRGRCHR draws with the text font most of the time; MAZESCRN swaps in the box-drawing one
      // for the frame and swaps it straight back, as the original did.
      this.display.textFont.load(scenario.readBlock(TEXT_FONT_BLOCK));
      this.display.charset.load(scenario.readBlock(TEXT_FONT_BLOCK));
      this.playing.set(scenario);
      this.machine = createRuntime(scenario, undefined, this.display);
      setRuntime(this.machine);
      resetglobals();

      // The game never returns: there was no way out of the mainline but switching the machine off.
      void wizardry().catch((thrown: unknown): void => {
        if (this.machine !== null) {
          throw thrown;
        }
      });

      scenario.onChanged = (): void => this.scheduleSave();
    }
  }


  /**
   * Puts the disk to storage. The game writes a record the moment something happens to a
   * character - joining a party, leaving one, being rolled - and on the real machine the write
   * was on the floppy before the next thing could happen. Saving off the back of the write itself,
   * rather than sweeping every so often, is what keeps that true: there is no window in which the
   * player has left the Edge of Town, their party has been put down on the disk in front of them,
   * and closing the tab would take it back.
   */
  private scheduleSave(): void {
    if (this.pendingSave == null) {
      this.pendingSave = setTimeout((): void => {
        this.pendingSave = undefined;
        void this.save();
      }, SAVE_DELAY);
    }
  }


  private async save(): Promise<void> {
    const scenario: ScenarioDisk | null = this.playing();
    const disk: ISaveDisk | null = this.inDrive;

    if ((scenario !== null) && (disk !== null) && scenario.changed) {
      if (this.saving) {
        // A save is already in flight and will not carry this change; queue another behind it.
        this.scheduleSave();
      } else {
        this.saving = true;
        scenario.changed = false;

        try {
          await this.library.save(disk, scenario.contents);
        } catch {
          // It did not land, so the disk still has something to say. Try again.
          scenario.changed = true;
          this.scheduleSave();
        } finally {
          this.saving = false;
        }
      }
    }
  }


  /** Writes the disk back before putting it away, as the game did on leaving the maze. */
  private async stopPlaying(): Promise<void> {
    const scenario: ScenarioDisk | null = this.playing();

    if ((this.inDrive !== null) && (scenario !== null)) {
      scenario.onChanged = null;
      await this.library.save(this.inDrive, scenario.contents);
      scenario.changed = false;
    }

    clearTimeout(this.pendingSave);
    this.pendingSave = undefined;
    this.inDrive = null;
    this.machine = null;
    setRuntime(null);
    this.playing.set(null);
    await this.refreshShelf();
  }

}
