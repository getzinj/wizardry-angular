import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { IStartupProgress } from './startup-steps';
import { StartupStepsComponent } from './startup-steps.component';


function render(progress: IStartupProgress): ComponentFixture<StartupStepsComponent> {
  const fixture: ComponentFixture<StartupStepsComponent> = TestBed.createComponent(StartupStepsComponent);

  fixture.componentRef.setInput('progress', progress);
  fixture.detectChanges();

  return fixture;
}


function titles(fixture: ComponentFixture<StartupStepsComponent>): readonly string[] {
  const found: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('.title');

  return Array.from(found, (element: Element): string => element.textContent ?? '');
}


function currentTitle(fixture: ComponentFixture<StartupStepsComponent>): string | null {
  const found: Element | null = fixture.nativeElement.querySelector('[aria-current="step"] .title');

  return (found === null) ? null : found.textContent;
}


describe('StartupStepsComponent', (): void => {
  it('names all three steps whichever one they are on', (): void => {
    const fixture: ComponentFixture<StartupStepsComponent> =
      render({ hasMaster: false, diskCount: 0, everPlayed: false });

    expect(titles(fixture)).toEqual(['Scenario disk', 'Character disk', 'Enter the castle']);
  });

  it('marks the scenario disk as the step to take first', (): void => {
    const fixture: ComponentFixture<StartupStepsComponent> =
      render({ hasMaster: false, diskCount: 0, everPlayed: false });

    expect(currentTitle(fixture)).toBe('Scenario disk');
  });

  it('moves on once the master is in hand', (): void => {
    const fixture: ComponentFixture<StartupStepsComponent> =
      render({ hasMaster: true, diskCount: 0, everPlayed: false });

    expect(currentTitle(fixture)).toBe('Character disk');
  });

  it('ticks off the steps already taken', (): void => {
    const fixture: ComponentFixture<StartupStepsComponent> =
      render({ hasMaster: true, diskCount: 1, everPlayed: false });

    expect(fixture.nativeElement.querySelectorAll('li.done').length).toBe(2);
  });

  it('marks no step as current once there is nothing left to do', (): void => {
    const fixture: ComponentFixture<StartupStepsComponent> =
      render({ hasMaster: true, diskCount: 1, everPlayed: true });

    expect(currentTitle(fixture)).toBeNull();
  });

  it('says when the player has had enough of it', (): void => {
    const fixture: ComponentFixture<StartupStepsComponent> =
      render({ hasMaster: false, diskCount: 0, everPlayed: false });
    let asked: boolean = false;

    fixture.componentInstance.dismissed.subscribe((): void => {
      asked = true;
    });
    fixture.nativeElement.querySelector('.dismiss').click();

    expect(asked).toBe(true);
  });
});
