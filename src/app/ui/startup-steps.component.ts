import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { IStartupProgress } from './startup-steps';
import { StartupStep, currentStep } from './startup-steps';


/** One step as the rail draws it. */
interface IStepView {
  readonly step: StartupStep;
  readonly ordinal: number;
  readonly title: string;
  readonly detail: string;
}


const STEPS: readonly IStepView[] = [
  {
    step: StartupStep.scenarioDisk,
    ordinal: 1,
    title: 'Scenario disk',
    detail: 'Your own copy of Wizardry, imaged as a disk file. Not the boot disk: the other one, '
          + 'the one holding the game\'s data.',
  },
  {
    step: StartupStep.characterDisk,
    ordinal: 2,
    title: 'Character disk',
    detail: 'A working copy of that disk. Your characters are written onto it as you play, which '
          + 'is why the master stays untouched.',
  },
  {
    step: StartupStep.play,
    ordinal: 3,
    title: 'Enter the castle',
    detail: 'Put a character disk in the drive. From there the game runs as it did on the machine.',
  },
];


/**
 * The three things that stand between a new player and the game, and which of them they are on.
 *
 * This only ever reports; every step is taken on the screen below it. It is shown until the player
 * has played once, or until they say they have had enough of it.
 */
@Component({
  selector: 'wiz-startup-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="rail" aria-label="Getting started">
      <ol>
        @for (item of steps; track item.step) {
          <li [class.current]="item.step === step()"
              [class.done]="item.step < step()"
              [attr.aria-current]="item.step === step() ? 'step' : null">
            <span class="ordinal" aria-hidden="true">{{ item.step < step() ? '&check;' : item.ordinal }}</span>
            <span class="body">
              <span class="title">{{ item.title }}</span>
              <span class="detail">{{ item.detail }}</span>
            </span>
          </li>
        }
      </ol>

      <button type="button" class="dismiss" (click)="dismissed.emit()">Hide these steps</button>
    </nav>
  `,
  styles: [`
    :host {
      display: block;
      width: min(36rem, 100%);
      margin: 0 auto 1.5rem;
    }

    .rail {
      padding: 1.25rem 1.5rem;
      border: 1px solid #3a3a3a;
    }

    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      gap: 0.9rem;
      padding: 0.6rem 0;
      color: #777;
    }

    li + li {
      border-top: 1px solid #1c1c1c;
    }

    .ordinal {
      flex: 0 0 auto;
      width: 1.6rem;
      height: 1.6rem;
      border: 1px solid currentcolor;
      line-height: 1.5rem;
      text-align: center;
      font-size: 0.8rem;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .title {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.8rem;
    }

    .detail {
      font-size: 0.8rem;
      line-height: 1.5;
    }

    li.current {
      color: #00cc44;
    }

    li.current .detail {
      color: #bbb;
    }

    li.done {
      color: #4a4a4a;
    }

    li.done .detail {
      display: none;
    }

    .dismiss {
      margin-top: 0.75rem;
      padding: 0;
      border: none;
      background: none;
      color: #666;
      font: inherit;
      font-size: 0.75rem;
      text-decoration: underline;
      cursor: pointer;
    }

    .dismiss:hover {
      color: #999;
    }
  `],
})
export class StartupStepsComponent {
  public readonly progress = input.required<IStartupProgress>();

  public readonly dismissed = output<void>();

  public readonly steps: readonly IStepView[] = STEPS;

  public readonly step = computed<StartupStep>((): StartupStep => currentStep(this.progress()));

}
