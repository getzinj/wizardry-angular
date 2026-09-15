import { beforeEach, describe, expect, it } from 'vitest';

import type { ICharacter } from '../data/layout/wiz-types';
import { Zone, object } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { rt } from '../runtime/runtime';
import { camp } from './camp2';
import { resetcamp } from './camp';
import { boot, flush, rosterOf, screenAfter as shownAfter, somebody } from './port-fixture';
import { Talign, Tattrib, Tclass, Tstatus, Xgoto, g } from './wiz';

/** Keys a test will hand over before giving up on the camp ever letting go. */
const PATIENCE: number = 60;


/** Somebody worth looking at: a full set of numbers, some gold, and a little experience. */
function somebodyNotable(name: string): ICharacter {
  const who: ICharacter = somebody(name, Talign.good);

  who.race = 2;
  who.characterClass = Tclass.priest;
  who.level = 4;
  who.maximumLevel = 4;
  who.age = 18 * 52;
  who.hitPoints = 17;
  who.maximumHitPoints = 22;
  who.armourClass = 6;
  who.gold.low = 1234;
  who.experience.low = 9000;
  who.attributes[Tattrib.strength] = 11;
  who.attributes[Tattrib.iq] = 9;
  who.attributes[Tattrib.piety] = 17;
  who.attributes[Tattrib.vitality] = 13;
  who.attributes[Tattrib.agility] = 10;
  who.attributes[Tattrib.luck] = 8;
  who.priestSpellSlots[0] = 2;
  who.spellsKnown[23] = 1;

  return who;
}


/** Gives somebody three things to carry: one equipped, one cursed and equipped, one unidentified. */
function withThreeItems(who: ICharacter): ICharacter {
  who.possessions.count = 3;
  who.possessions.items[0].objectIndex = 0;
  who.possessions.items[0].equipped = true;
  who.possessions.items[0].identified = true;
  who.possessions.items[1].objectIndex = 1;
  who.possessions.items[1].equipped = true;
  who.possessions.items[1].identified = true;
  who.possessions.items[1].cursed = true;
  who.possessions.items[2].objectIndex = 2;
  who.possessions.items[2].identified = false;

  return who;
}


/** Stands the party in the camp, coming from wherever `from` says. */
function atTheCamp(from: Xgoto, ...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, from);
  resetcamp();
  g.partycnt = party.length;
  g.mazelev = 1;

  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  g.llbase04 = 0;

  return scenario;
}


/** Runs the camp, answering every prompt from the same script over and over. */
async function drive(script: readonly string[]): Promise<void> {
  let finished: boolean = false;
  let keys: number = 0;

  const running: Promise<void> = camp().finally((): void => {
    finished = true;
  });

  while (!finished) {
    await flush();

    if (!finished && rt().keyboard.waiting) {
      if (keys >= PATIENCE) {
        throw new Error('the camp is never letting go');
      }

      rt().keyboard.push(script[keys % script.length]);
      keys = keys + 1;
    }
  }

  await running;
}


/** Hands over `before`, then reads the screen while the next prompt is still waiting. */
function screenAfter(before: readonly string[], then: readonly string[]): Promise<string> {
  return shownAfter(camp, before, then);
}


describe('a character sheet', (): void => {
  let onScreen: string;

  beforeEach(async (): Promise<void> => {
    const scenario: ScenarioDisk =
      atTheCamp(Xgoto.xinspect, withThreeItems(somebodyNotable('PORFIRIO')));

    // The dash against an item comes from the object being a cursed kind of thing, which is a
    // different flag from the one on the slot that stops it being dropped. Clearing the slot's own
    // flag leaves only the object's, so the dash below can have come from nowhere else.
    const cursed: ReturnType<typeof object.read> = scenario.read(Zone.object, 1, object);

    cursed.cursed = true;
    scenario.write(Zone.object, 1, object, cursed);
    g.charactr[0].possessions.items[1].cursed = false;

    onScreen = await screenAfter([], [ 'L' ]);
  });

  it('names them', (): void => {
    expect(onScreen).toContain('PORFIRIO');
  });

  it('heads it with their race, their alignment as one letter, and their class', (): void => {
    expect(onScreen).toContain('RACE2 1-CLAS2');
  });

  it('lists the six attributes', (): void => {
    expect(onScreen).toContain('STRENGTH');
  });

  it('shows what each attribute stands at', (): void => {
    // Piety seventeen, in a field of three, straight after the label.
    expect(onScreen).toContain('PIETY 17');
  });

  it('shows their gold', (): void => {
    expect(onScreen).toContain('1234');
  });

  it('shows their hit points as what is left out of the most they have had', (): void => {
    expect(onScreen).toContain('17/ 22');
  });

  it('shows an age in years, where the record keeps weeks', (): void => {
    expect(onScreen).toContain('AGE  18');
  });

  it('shows their status', (): void => {
    expect(onScreen).toContain('STATUS STAT0');
  });

  it('shows the spell slots, one group per column', (): void => {
    expect(onScreen).toContain('PRIEST 2/0/0/0/0/0/0');
  });

  it('explains the marks against the items', (): void => {
    expect(onScreen).toContain('*=EQUIP, -=CURSED, ?=UNKNOWN, #=UNUSABLE');
  });

  it('marks an equipped item with a star', (): void => {
    expect(onScreen).toContain('1)*ITEM 0');
  });

  it('marks a cursed one with a dash instead', (): void => {
    expect(onScreen).toContain('2)-ITEM 1');
  });

  it('gives an unidentified one only the name it goes by', (): void => {
    expect(onScreen).toContain('3)??ITEM 2');
  });
});


describe('the menu under the sheet', (): void => {
  it('offers everything to a character standing in the maze', async (): Promise<void> => {
    atTheCamp(Xgoto.xinspct2, somebodyNotable('PORFIRIO'));

    expect(await screenAfter([ '1' ], [ 'L', 'L' ])).toContain('CAST S)PELLS');
  });

  it('offers no spells from the castle, where there is nothing to prepare for',
     async (): Promise<void> => {
       atTheCamp(Xgoto.xinspect, somebodyNotable('PORFIRIO'));

       expect(await screenAfter([], [ 'L' ])).not.toContain('CAST S)PELLS');
     });

  it('offers only the spell books at the training grounds', async (): Promise<void> => {
    atTheCamp(Xgoto.xinspct3, somebodyNotable('PORFIRIO'));

    expect(await screenAfter([], [ 'L' ]))
      .toContain('YOU MAY R)EAD SPELL BOOKS OR L)EAVE.');
  });

  it('takes the spells away from somebody in no state to cast them', async (): Promise<void> => {
    const hurt: ICharacter = somebodyNotable('PORFIRIO');

    hurt.status = Tstatus.asleep;
    atTheCamp(Xgoto.xinspct2, hurt);

    expect(await screenAfter([ '1' ], [ 'L', 'L' ])).not.toContain('CAST S)PELLS');
  });
});


describe('dropping an item', (): void => {
  beforeEach(async (): Promise<void> => {
    const who: ICharacter = withThreeItems(somebodyNotable('PORFIRIO'));

    who.possessions.items[0].equipped = false;
    atTheCamp(Xgoto.xinspct2, who);
    await drive([ '1', 'D', '1', 'L', 'L' ]);
  });

  it('takes it off them', (): void => {
    expect(g.charactr[0].possessions.count).toBe(2);
  });

  it('moves what was above it down a slot', (): void => {
    expect(g.charactr[0].possessions.items[0].objectIndex).toBe(1);
  });
});


describe('dropping an item that will not be dropped', (): void => {
  it('keeps a cursed one, which is the point of it being cursed', async (): Promise<void> => {
    const who: ICharacter = withThreeItems(somebodyNotable('PORFIRIO'));

    who.possessions.items[1].equipped = false;
    atTheCamp(Xgoto.xinspct2, who);
    await drive([ '1', 'D', '2', 'L', 'L' ]);

    expect(g.charactr[0].possessions.count).toBe(3);
  });

  it('keeps one that is being worn', async (): Promise<void> => {
    atTheCamp(Xgoto.xinspct2, withThreeItems(somebodyNotable('PORFIRIO')));
    await drive([ '1', 'D', '1', 'L', 'L' ]);

    expect(g.charactr[0].possessions.count).toBe(3);
  });
});


describe('casting a camp spell by name', (): void => {
  it('heals, and spends the slot it cost', async (): Promise<void> => {
    const priest: ICharacter = somebodyNotable('PORFIRIO');

    atTheCamp(Xgoto.xinspct2, priest);
    await drive([ '1', 'S', 'D', 'I', 'O', 'S', '\r', '1', 'L', 'L' ]);

    expect(g.charactr[0].priestSpellSlots[0]).toBe(1);
  });

  it('puts the hit points back', async (): Promise<void> => {
    atTheCamp(Xgoto.xinspct2, somebodyNotable('PORFIRIO'));
    await drive([ '1', 'S', 'D', 'I', 'O', 'S', '\r', '1', 'L', 'L' ]);

    expect(g.charactr[0].hitPoints).toBeGreaterThan(17);
  });

  it('says so and spends nothing where the spell is not known', async (): Promise<void> => {
    const ignorant: ICharacter = somebodyNotable('PORFIRIO');

    ignorant.spellsKnown[23] = 0;
    atTheCamp(Xgoto.xinspct2, ignorant);
    await drive([ '1', 'S', 'D', 'I', 'O', 'S', '\r', 'L', 'L' ]);

    expect(g.charactr[0].priestSpellSlots[0]).toBe(2);
  });
});


describe('reading the spell books', (): void => {
  beforeEach(async (): Promise<void> => {
    atTheCamp(Xgoto.xinspct2, somebodyNotable('PORFIRIO'));
    await drive([ '1', 'R' ]);
  });

  it('leaves the camp for the segment that does it', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcampstf);
  });

  it('says which of the five it wants, in the word the camp shares with the castle', (): void => {
    expect(g.base12).toBe(Xgoto.xdone);
  });

  it('says whose books they are', (): void => {
    expect(g.llbase04).toBe(0);
  });
});


describe('identifying an item', (): void => {
  it('is refused to anybody who is not a bishop', async (): Promise<void> => {
    atTheCamp(Xgoto.xinspct2, somebodyNotable('PORFIRIO'));
    await drive([ '1', 'I', 'L', 'L' ]);

    expect(g.xgoto).toBe(Xgoto.xcmp2eq6);
  });

  it('sends a bishop to the segment that does it', async (): Promise<void> => {
    const bishop: ICharacter = somebodyNotable('PORFIRIO');

    bishop.characterClass = Tclass.bishop;
    atTheCamp(Xgoto.xinspct2, bishop);
    await drive([ '1', 'I' ]);

    expect(g.base12).toBe(Xgoto.xtrainin);
  });
});


describe('trading with somebody else in the party', (): void => {
  beforeEach(async (): Promise<void> => {
    const giver: ICharacter = withThreeItems(somebodyNotable('PORFIRIO'));

    giver.possessions.items[0].equipped = false;
    atTheCamp(Xgoto.xinspct2, giver, somebodyNotable('BORIS'));

    // Trade with 2), hand over 500 gold, then item 1, then a bare return to stop.
    await drive([ '1', 'T', '2', '5', '0', '0', '\r', '1', '\r', 'L', 'L' ]);
  });

  it('moves the gold across', (): void => {
    expect(g.charactr[1].gold.low).toBe(1734);
  });

  it('takes it off the one handing it over', (): void => {
    expect(g.charactr[0].gold.low).toBe(734);
  });

  it('moves the item across too', (): void => {
    expect(g.charactr[1].possessions.count).toBe(1);
  });

  it('takes the item off the one handing it over', (): void => {
    expect(g.charactr[0].possessions.count).toBe(2);
  });
});


describe('the honours a character has been awarded', (): void => {
  it('are shown as marks between quotes, one per award', async (): Promise<void> => {
    const honoured: ICharacter = somebodyNotable('PORFIRIO');

    // Bits nought and two of the fourth of the four words the record reads three ways.
    honoured.lostLocation[3] = 0b101;
    atTheCamp(Xgoto.xinspect, honoured);

    expect(await screenAfter([], [ 'L' ])).toContain('">$"');
  });
});
