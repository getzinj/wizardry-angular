import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';

import type { IScenarioFiles, ScenarioImportResult } from '../data/scenario-import';
import { importScenarioDisk } from '../data/scenario-import';


/**
 * Asks the player for their scenario disk.
 *
 * The game's data is not distributed with this, so a player brings their own copy of the disk, the
 * way an emulator expects you to bring your own. Whatever they hand over is checked before it is
 * accepted, and a refusal says what was wrong and what to do about it: handing over the boot disk
 * by mistake is much the likeliest way this goes wrong, and it looks identical from the outside.
 */
@Component({
  selector: 'wiz-scenario-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel"
         [class.over]="draggedOver()"
         (dragover)="onDragOver($event)"
         (dragleave)="draggedOver.set(false)"
         (drop)="onDrop($event)">

      <h1>Wizardry</h1>
      <p class="lead">Proving Grounds of the Mad Overlord</p>

      <p>
        This needs your own copy of the game. Drop the <strong>scenario disk</strong> image here,
        or choose the file.
      </p>

      <label class="choose">
        <input type="file" accept=".dsk,.po,.do,.image" (change)="onChoose($event)">
        <span>Choose a disk image</span>
      </label>

      @if (busy()) {
        <p class="working">Reading the disk...</p>
      }

      @if (failure(); as problem) {
        <div class="failure" role="alert">
          <p class="headline">{{ problem.message }}</p>
          @for (line of problem.detail; track line) {
            <p>{{ line }}</p>
          }
        </div>
      }

      <p class="note">
        The disk stays in this browser. Nothing is uploaded.
      </p>
    </div>
  `,
  styles: [`
    :host {
      display: grid;
      place-items: center;
      height: 100%;
      padding: 1rem;
    }

    .panel {
      max-width: 34rem;
      padding: 2rem;
      border: 1px solid #3a3a3a;
      text-align: center;
      transition: border-color 120ms, background 120ms;
    }

    .panel.over {
      border-color: #00cc44;
      background: #071107;
    }

    h1 {
      margin: 0;
      font-size: 2rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
    }

    .lead {
      margin: 0.25rem 0 2rem;
      color: #888;
      letter-spacing: 0.1em;
    }

    .choose input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
    }

    .choose span {
      display: inline-block;
      margin: 1rem 0;
      padding: 0.6rem 1.4rem;
      border: 1px solid #e0e0e0;
      cursor: pointer;
    }

    .choose span:hover,
    .choose input:focus-visible + span {
      background: #e0e0e0;
      color: #000;
    }

    .failure {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-left: 3px solid #d400cc;
      text-align: left;
      color: #ccc;
    }

    .failure .headline {
      margin-top: 0;
      color: #fff;
    }

    .failure p {
      margin: 0.35rem 0;
    }

    .note {
      margin-bottom: 0;
      color: #666;
      font-size: 0.8rem;
    }
  `],
})
export class ScenarioImportComponent {
  public readonly imported = output<IScenarioFiles>();

  public readonly draggedOver = signal<boolean>(false);
  public readonly busy = signal<boolean>(false);
  public readonly failure = signal<{ message: string; detail: readonly string[] } | null>(null);


  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.draggedOver.set(true);
  }


  public onDrop(event: DragEvent): void {
    event.preventDefault();
    this.draggedOver.set(false);

    const file: File | undefined = event.dataTransfer?.files?.[0];

    if (file != null) {
      void this.accept(file);
    }
  }


  public onChoose(event: Event): void {
    const file: File | undefined = (event.target as HTMLInputElement).files?.[0];

    if (file != null) {
      void this.accept(file);
    }
  }


  private async accept(file: File): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      const bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      const result: ScenarioImportResult = importScenarioDisk(bytes);

      if (result.ok) {
        this.imported.emit(result.files);
      } else {
        this.failure.set({ message: result.message, detail: result.detail });
      }
    } catch {
      this.failure.set({ message: 'That file could not be read.', detail: ['It may be in use, or no longer there.'] });
    } finally {
      this.busy.set(false);
    }
  }

}
