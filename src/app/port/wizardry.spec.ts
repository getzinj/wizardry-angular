import { beforeEach, describe, expect, it } from 'vitest';

import { rt } from '../runtime/runtime';
import { RETURN, boot, play, rosterOf, somebody, waitAtPrompt } from './port-fixture';
import { Xgoto, g } from './wiz';
import { segment } from './wizardry';

// The castle is a dead end on its own: the training grounds are reached through the Edge of Town
// and nowhere else. This walks the whole way round, one segment at a time, the way the trampoline
// does - and the way a player finds out whether the road is open.

describe('the road out of the castle', (): void => {
  beforeEach((): void => {
    boot(rosterOf(somebody('FRODO')), Xgoto.xcastle);
  });

  it('leaves for the edge of town on E', async (): Promise<void> => {
    await play(segment, [ 'E' ]);

    expect(g.xgoto).toBe(Xgoto.xedgtown);
  });

  it('offers the training grounds once at the edge of town', async (): Promise<void> => {
    await play(segment, [ 'E' ]);
    await play(segment, [ 'T' ]);

    expect(g.xgoto).toBe(Xgoto.xtrainin);
  });
});


describe('arriving at the training grounds', (): void => {
  let onScreen: string;

  beforeEach(async (): Promise<void> => {
    boot(rosterOf(somebody('FRODO')), Xgoto.xcastle);
    await play(segment, [ 'E' ]);
    await play(segment, [ 'T' ]);

    // The screen has to be read while the segment is still on it: leaving clears it.
    const { running }: { running: Promise<void> } = await waitAtPrompt(segment);

    onScreen = rt().display.text.toString();
    rt().keyboard.push(RETURN);
    await running;
  });

  it('shows the training grounds', (): void => {
    expect(onScreen).toContain('TRAINING GROUNDS');
  });

  it('says nothing about a segment being missing along the way', (): void => {
    expect(onScreen).not.toContain('NOT PORTED');
  });

  it('goes back to the castle when the name is left blank', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});
