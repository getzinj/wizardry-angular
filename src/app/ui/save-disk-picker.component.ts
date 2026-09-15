import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { ISaveDiskSummary } from '../data/save-disks';


/**
 * The shelf of save disks, and the choice of which to play.
 *
 * The game had no save files: your characters lived on the scenario disk, which it wrote to as you
 * played. Players kept a master untouched and played on copies. Keeping that shape means a save is
 * a whole disk, so there is nothing to decide about what is worth keeping, and two parties on two
 * disks cannot disturb each other.
 */
@Component({
  selector: 'wiz-save-disk-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <h1>Save disks</h1>
      <p class="lead">{{ gameName() }}</p>

      @if (disks().length === 0) {
        <p class="empty">No save disks yet. Make one from your master and start playing.</p>
      } @else {
        <ul>
          @for (disk of disks(); track disk.id) {
            <li>
              <input class="name"
                     type="text"
                     [value]="disk.name"
                     [attr.aria-label]="'Name of ' + disk.name"
                     (change)="renamed.emit({ id: disk.id, name: asValue($event) })">
              <span class="played">{{ lastPlayed(disk) }}</span>
              <button type="button" class="play" (click)="played.emit(disk.id)">Play</button>
              <button type="button" (click)="exported.emit(disk.id)">Export</button>
              <button type="button" class="discard" (click)="discarded.emit(disk.id)">Discard</button>
            </li>
          }
        </ul>
      }

      @if (full()) {
        <p class="note">
          There is room for {{ limit() }} disks. Discard one to make another.
        </p>
      } @else {
        <div class="new">
          <input type="text"
                 aria-label="Name for the new disk"
                 [value]="newName()"
                 (input)="newName.set(asValue($event))">
          <button type="button" (click)="created.emit(newName())">Make a new disk</button>
        </div>
      }

      <div class="restore">
        <label>
          <input type="file" accept=".dsk,.po,.do,.image" (change)="onRestore($event)">
          <span>Import a save disk</span>
        </label>
        <p class="hint">An exported disk is an ordinary disk image, so it can be kept anywhere.</p>
      </div>

      @if (restoreFailure(); as problem) {
        <p class="failure" role="alert">{{ problem }}</p>
      }

      <button type="button" class="another" (click)="reimported.emit()">Use a different scenario disk</button>
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
      width: min(36rem, 100%);
      padding: 2rem;
      border: 1px solid #3a3a3a;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      letter-spacing: 0.25em;
      text-transform: uppercase;
    }

    .lead {
      margin: 0.25rem 0 1.5rem;
      color: #888;
    }

    ul {
      margin: 0 0 1.5rem;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #222;
    }

    .name {
      flex: 1 1 auto;
      min-width: 6rem;
    }

    .played {
      color: #777;
      font-size: 0.75rem;
      white-space: nowrap;
    }

    input {
      padding: 0.35rem 0.5rem;
      border: 1px solid #444;
      background: #000;
      color: inherit;
      font: inherit;
    }

    button {
      padding: 0.35rem 0.9rem;
      border: 1px solid #555;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      border-color: #e0e0e0;
    }

    .play {
      border-color: #00cc44;
    }

    .new {
      display: flex;
      gap: 0.75rem;
    }

    .new input {
      flex: 1 1 auto;
    }

    .empty,
    .note {
      color: #888;
    }

    .restore {
      margin-top: 1.5rem;
    }

    .restore input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
    }

    .restore span {
      display: inline-block;
      padding: 0.35rem 0.9rem;
      border: 1px solid #555;
      cursor: pointer;
    }

    .restore span:hover,
    .restore input:focus-visible + span {
      border-color: #e0e0e0;
    }

    .hint {
      margin: 0.5rem 0 0;
      color: #666;
      font-size: 0.75rem;
    }

    .failure {
      margin: 0.75rem 0 0;
      padding-left: 0.75rem;
      border-left: 3px solid #d400cc;
      color: #ccc;
    }

    .another {
      margin-top: 1.5rem;
      border: none;
      padding-left: 0;
      color: #777;
      text-decoration: underline;
    }
  `],
})
export class SaveDiskPickerComponent {
  public readonly disks = input.required<readonly ISaveDiskSummary[]>();
  public readonly gameName = input.required<string>();
  public readonly limit = input.required<number>();

  public readonly restoreFailure = input<string | null>(null);

  public readonly played = output<string>();
  public readonly exported = output<string>();
  public readonly restored = output<File>();
  public readonly created = output<string>();
  public readonly discarded = output<string>();
  public readonly renamed = output<{ id: string; name: string }>();
  public readonly reimported = output<void>();

  public readonly newName = signal<string>('');
  public readonly full = computed<boolean>((): boolean => this.disks().length >= this.limit());


  public onRestore(event: Event): void {
    const input: HTMLInputElement = event.target as HTMLInputElement;
    const file: File | undefined = input.files?.[0];

    if (file != null) {
      this.restored.emit(file);
      // Cleared so the same file can be chosen twice running, which otherwise raises no event.
      input.value = '';
    }
  }


  public asValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }


  public lastPlayed(disk: ISaveDiskSummary): string {
    if (disk.playedAt === disk.createdAt) {
      return 'never played';
    } else {
      return new Date(disk.playedAt).toLocaleDateString();
    }
  }

}
