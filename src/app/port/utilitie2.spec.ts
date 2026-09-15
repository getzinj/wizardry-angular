import { describe, expect, it } from 'vitest';

import type { ICharacter, IObject } from '../data/layout/wiz-types';
import { Zone, object } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { rt } from '../runtime/runtime';
import { RETURN, boot, press, rosterOf, somebody } from './port-fixture';
import { utilitie } from './utilitie';
import { Talign, Tattrib, Tclass, Tobjtype, Tstatus, Xgoto, g } from './wiz';

// The equip screen, which is EQUIPCHR doing the half of its job that asks. E) on a character sheet
// reaches it, and then every kind of thing they can use is offered a slot at a time, and every
// thing they carry with a power of its own is offered after that.

/** Stands one character in front of the equip screen, as E) on their sheet leaves them. */
function equipping(...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, Xgoto.xeqpdsp);
  g.partycnt = party.length;

  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  g.llbase04 = 0;

  return scenario;
}


/** Writes one object record, leaving everything the test did not name as the fixture had it. */
function anObject(scenario: ScenarioDisk, index: number, fields: Partial<IObject>): void {
  const record: IObject = scenario.read(Zone.object, index, object);

  Object.assign(record, fields);
  scenario.write(Zone.object, index, object, record);
}


/** A fighter carrying `count` things, every one of them object number one upwards. */
function carrying(count: number): ICharacter {
  const who: ICharacter = somebody('GARETH');

  who.characterClass = Tclass.fighter;
  who.possessions.count = count;

  for (let index: number = 0; index < count; index++) {
    who.possessions.items[index].objectIndex = index + 1;
    who.possessions.items[index].identified = true;
  }

  return who;
}


/** Makes object `index` a weapon a fighter can pick up. Both names are STRING[ 15] on the disk. */
function aWeapon(scenario: ScenarioDisk, index: number, name: string): void {
  const usable: number[] = new Array<number>(8).fill(0);

  usable[Tclass.fighter] = 1;
  anObject(scenario, index, {
    name,
    unidentifiedName: 'A SHARP THING',
    objectType: Tobjtype.weapon,
    usableByClass: usable,
    special: 0,
  });
}


/** Runs the segment with every key queued, so the rolls stay where the seed put them. */
async function runs(keys: string): Promise<void> {
  press(keys);
  await utilitie();
}


function onScreen(): string {
  return rt().display.text.toString();
}


describe('choosing what to equip', (): void => {
  it('names the kind of thing it is asking about and who for', async (): Promise<void> => {
    const who: ICharacter = carrying(1);

    aWeapon(equipping(who), 1, 'SHORT SWORD');
    await runs(RETURN);

    expect(onScreen()).toContain('SELECT WEAPON FOR GARETH');
  });

  it('lists what they are carrying of that kind', async (): Promise<void> => {
    const who: ICharacter = carrying(1);

    aWeapon(equipping(who), 1, 'SHORT SWORD');
    await runs(RETURN);

    expect(onScreen()).toContain('1) SHORT SWORD');
  });

  it('gives an unidentified one only the name it goes by, behind a question mark',
     async (): Promise<void> => {
       const who: ICharacter = carrying(1);

       who.possessions.items[0].identified = false;
       aWeapon(equipping(who), 1, 'SHORT SWORD');
       await runs(RETURN);

       expect(onScreen()).toContain('1)?A SHARP THING');
     });

  it('equips the one that is chosen', async (): Promise<void> => {
    const who: ICharacter = carrying(1);

    aWeapon(equipping(who), 1, 'SHORT SWORD');
    await runs('1');

    expect(who.possessions.items[0].equipped).toBe(true);
  });

  it('equips nothing when the answer is [RET]', async (): Promise<void> => {
    const who: ICharacter = carrying(1);

    aWeapon(equipping(who), 1, 'SHORT SWORD');
    await runs(RETURN);

    expect(who.possessions.items[0].equipped).toBe(false);
  });

  it('keeps asking until the number is one of the listed, unlike IDENTIFY',
     async (): Promise<void> => {
       const who: ICharacter = carrying(1);

       aWeapon(equipping(who), 1, 'SHORT SWORD');
       await runs(`93${ RETURN }`);

       expect(who.possessions.items[0].equipped).toBe(false);
     });

  it('goes back to the character sheet afterwards', async (): Promise<void> => {
    const who: ICharacter = carrying(1);

    aWeapon(equipping(who), 1, 'SHORT SWORD');
    await runs(RETURN);

    expect(g.xgoto).toBe(Xgoto.xbck2cmp);
  });

  it('indents each line ten columns and starts the list on the fourth row',
     async (): Promise<void> => {
       const who: ICharacter = carrying(1);

       aWeapon(equipping(who), 1, 'SHORT SWORD');
       await runs(RETURN);

       expect(rt().display.text.line(3).trimEnd()).toBe('          1) SHORT SWORD');
     });

  it('equips the slot the chosen line stands for, not the slot of that number',
     async (): Promise<void> => {
       // Armour in the first slot and the weapon in the second, so the weapon list has one line
       // and that line means slot two. Answering 1 must reach the weapon, not the armour.
       const who: ICharacter = carrying(2);
       const scenario: ScenarioDisk = equipping(who);
       const usable: number[] = new Array<number>(8).fill(0);

       usable[Tclass.fighter] = 1;
       anObject(scenario, 1, { name: 'LEATHER', objectType: Tobjtype.armor, usableByClass: usable,
                               special: 0 });
       aWeapon(scenario, 2, 'SHORT SWORD');

       // Weapon is asked for first, then armour, which is declined.
       await runs(`1${ RETURN }`);

       expect([ who.possessions.items[0].equipped, who.possessions.items[1].equipped ])
         .toEqual([ false, true ]);
     });

  it('asks nothing at all about a kind of thing they have none of', async (): Promise<void> => {
    // Nothing is carried, so CANUSE is clear for every type and no key is needed by any of them.
    equipping(carrying(0));

    await expect(runs('')).resolves.toBeUndefined();
  });
});


describe('a cursed thing in the list', (): void => {
  /** A fighter whose one weapon is stuck to their hand. */
  function stuck(): ICharacter {
    const who: ICharacter = carrying(1);

    who.possessions.items[0].cursed = true;

    return who;
  }

  it('marks it with a dash rather than a space', async (): Promise<void> => {
    const who: ICharacter = stuck();

    aWeapon(equipping(who), 1, 'CURSED BLADE');
    await runs('');

    expect(onScreen()).toContain('1)-CURSED BLADE');
  });

  it('takes the choice away, so nothing is asked and no key is needed',
     async (): Promise<void> => {
       aWeapon(equipping(stuck()), 1, 'CURSED BLADE');

       await expect(runs('')).resolves.toBeUndefined();
     });

  it('goes back on regardless', async (): Promise<void> => {
    const who: ICharacter = stuck();

    aWeapon(equipping(who), 1, 'CURSED BLADE');
    await runs('');

    expect(who.possessions.items[0].equipped).toBe(true);
  });

  it('says so', async (): Promise<void> => {
    aWeapon(equipping(stuck()), 1, 'CURSED BLADE');
    await runs('');

    expect(onScreen()).toContain('** CURSED **');
  });

  it('rings twice for every letter of it, which is all CURSBELL does', async (): Promise<void> => {
    aWeapon(equipping(stuck()), 1, 'CURSED BLADE');
    await runs('');

    expect(rt().display.text.bells).toBe(2 * '** CURSED **'.length);
  });

  it('puts it at the foot of the screen', async (): Promise<void> => {
    aWeapon(equipping(stuck()), 1, 'CURSED BLADE');
    await runs('');

    expect(rt().display.text.line(23).trimEnd()).toBe('       ** CURSED **');
  });
});


describe('a curse the choosing itself brings to light', (): void => {
  /**
   * An unidentified weapon whose object record is cursed. The slot's own flag is clear, so the scan
   * before the asking finds nothing and the player is given the choice - and then ARMORPOW, called
   * on whatever was picked, copies the curse off the object onto the slot. The scan after the
   * asking therefore finds what the first one could not.
   */
  function aHiddenCurse(): ICharacter {
    const who: ICharacter = carrying(1);
    const scenario: ScenarioDisk = equipping(who);
    const usable: number[] = new Array<number>(8).fill(0);

    who.possessions.items[0].identified = false;
    who.possessions.items[0].cursed = false;
    usable[Tclass.fighter] = 1;
    anObject(scenario, 1, {
      name: 'BLADE OF WOE',
      unidentifiedName: 'A PLAIN BLADE',
      objectType: Tobjtype.weapon,
      usableByClass: usable,
      alignment: Talign.unalign,
      cursed: true,
      armourModifier: 2,
      special: 0,
    });

    return who;
  }

  it('offers the choice, because the slot does not know yet', async (): Promise<void> => {
    aHiddenCurse();
    await runs('1');

    expect(onScreen()).toContain('WHICH ONE ([RET] FOR NONE) ? >');
  });

  it('marks the slot cursed once it is worn', async (): Promise<void> => {
    const who: ICharacter = aHiddenCurse();

    await runs('1');

    expect(who.possessions.items[0].cursed).toBe(true);
  });

  it('rings the bell the second scan reaches', async (): Promise<void> => {
    aHiddenCurse();
    await runs('1');

    expect(onScreen()).toContain('** CURSED **');
  });

  it('applies the thing twice, because ARMORPOW runs again for the forced equip',
     async (): Promise<void> => {
       // Armour class starts at ten and the blade takes two off each time it is applied. Collapsing
       // the two scans into one would leave this at eight.
       const who: ICharacter = aHiddenCurse();

       await runs('1');

       expect(who.armourClass).toBe(6);
     });
});


describe('a thing with a power of its own', (): void => {
  /** Makes object one a weapon whose power is `special`, and gives a fighter one of them. */
  function powered(special: number, changeChance: number = 0): ICharacter {
    const who: ICharacter = carrying(1);
    const scenario: ScenarioDisk = equipping(who);
    const usable: number[] = new Array<number>(8).fill(0);

    usable[Tclass.fighter] = 1;
    anObject(scenario, 1, {
      name: 'ODD TRINKET',
      unidentifiedName: 'ODD THING',
      objectType: Tobjtype.misc,
      usableByClass: usable,
      special,
      changeChance,
      changesTo: 2,
    });

    return who;
  }

  it('offers it by name', async (): Promise<void> => {
    powered(1);
    await runs(`${ RETURN }N`);

    expect(onScreen()).toContain('YOUR ODD TRINKET (Y/N) ? >');
  });

  it('offers an unidentified one by the name it goes by instead', async (): Promise<void> => {
    const who: ICharacter = powered(1);

    who.possessions.items[0].identified = false;
    await runs(`${ RETURN }N`);

    expect(onScreen()).toContain('YOUR ODD THING (Y/N) ? >');
  });

  it('turns one into a samurai', async (): Promise<void> => {
    const who: ICharacter = powered(15);

    await runs(`${ RETURN }Y`);

    expect(who.characterClass).toBe(Tclass.samurai);
  });

  it('hands over fifty thousand in experience too', async (): Promise<void> => {
    const who: ICharacter = powered(19);

    await runs(`${ RETURN }Y`);

    expect([ who.experience.low, who.experience.mid ]).toEqual([ 0, 5 ]);
  });

  it('adds a hit point to the most they have had', async (): Promise<void> => {
    const who: ICharacter = powered(22);

    who.maximumHitPoints = 11;
    await runs(`${ RETURN }Y`);

    expect(who.maximumHitPoints).toBe(12);
  });

  it('lets a score of two come back to three, which the guard on the new value allows',
     async (): Promise<void> => {
       const who: ICharacter = powered(1);

       who.attributes[Tattrib.strength] = 2;
       await runs(`${ RETURN }Y`);

       expect(who.attributes[Tattrib.strength]).toBe(3);
     });

  it('changes nothing when the answer is N', async (): Promise<void> => {
    // Ten, not the zero a blank character starts at: the guard rejects a new value of one, so at
    // zero this would pass whether or not N was honoured.
    const who: ICharacter = powered(1);

    who.attributes[Tattrib.strength] = 10;
    await runs(`${ RETURN }N`);

    expect(who.attributes[Tattrib.strength]).toBe(10);
  });

  it('raises the score its number names', async (): Promise<void> => {
    const who: ICharacter = powered(1);

    who.attributes[Tattrib.strength] = 10;
    await runs(`${ RETURN }Y`);

    expect(who.attributes[Tattrib.strength]).toBe(11);
  });

  it('counts on from strength, so three is piety', async (): Promise<void> => {
    const who: ICharacter = powered(3);

    who.attributes[Tattrib.piety] = 10;
    await runs(`${ RETURN }Y`);

    expect(who.attributes[Tattrib.piety]).toBe(11);
  });

  it('lowers the same score six numbers later', async (): Promise<void> => {
    const who: ICharacter = powered(7);

    who.attributes[Tattrib.strength] = 10;
    await runs(`${ RETURN }Y`);

    expect(who.attributes[Tattrib.strength]).toBe(9);
  });

  it('will not push a score past eighteen', async (): Promise<void> => {
    const who: ICharacter = powered(1);

    who.attributes[Tattrib.strength] = 18;
    await runs(`${ RETURN }Y`);

    expect(who.attributes[Tattrib.strength]).toBe(18);
  });

  it('will not pull one below three', async (): Promise<void> => {
    const who: ICharacter = powered(7);

    who.attributes[Tattrib.strength] = 3;
    await runs(`${ RETURN }Y`);

    expect(who.attributes[Tattrib.strength]).toBe(3);
  });

  it('takes a year off, but not below twenty', async (): Promise<void> => {
    const who: ICharacter = powered(13);

    who.age = 1040;
    await runs(`${ RETURN }Y`);

    expect(who.age).toBe(1040);
  });

  it('takes a year off one who is older than that', async (): Promise<void> => {
    const who: ICharacter = powered(13);

    who.age = 1092;
    await runs(`${ RETURN }Y`);

    expect(who.age).toBe(1040);
  });

  it('pays fifty thousand in gold', async (): Promise<void> => {
    const who: ICharacter = powered(18);

    await runs(`${ RETURN }Y`);

    expect([ who.gold.low, who.gold.mid ]).toEqual([ 0, 5 ]);
  });

  it('kills them outright', async (): Promise<void> => {
    const who: ICharacter = powered(20);

    await runs(`${ RETURN }Y`);

    expect(who.status).toBe(Tstatus.lost);
  });

  it('puts one back on their feet and takes the poison with it', async (): Promise<void> => {
    const who: ICharacter = powered(21);

    who.status = Tstatus.dead;
    who.hitPoints = 0;
    who.maximumHitPoints = 12;
    who.lostLocation[0] = 4;
    await runs(`${ RETURN }Y`);

    expect([ who.status, who.hitPoints, who.lostLocation[0] ]).toEqual([ Tstatus.ok, 12, 0 ]);
  });

  it('heals the whole party, and the slot past the last does not stop the game', async (): Promise<void> => {
    // The original's own comment marks the bound as a bug: the loop runs to PARTYCNT rather than
    // PARTYCNT - 1, so it reaches one slot past the party.
    const who: ICharacter = powered(23);

    who.hitPoints = 1;
    who.maximumHitPoints = 9;
    g.partycnt = 6;

    await expect(runs(`${ RETURN }Y`)).resolves.toBeUndefined();
    expect(who.hitPoints).toBe(9);
  });

  it('leaves the thing alone when the roll misses its chance of changing',
     async (): Promise<void> => {
       const who: ICharacter = powered(1, 0);

       await runs(`${ RETURN }Y`);

       expect(who.possessions.items[0].objectIndex).toBe(1);
     });

  it('turns it into what it names when the roll comes in under', async (): Promise<void> => {
    const who: ICharacter = powered(1, 100);

    await runs(`${ RETURN }Y`);

    expect(who.possessions.items[0].objectIndex).toBe(2);
  });

  it('offers nothing for a thing with no power of its own', async (): Promise<void> => {
    const who: ICharacter = carrying(1);

    aWeapon(equipping(who), 1, 'SHORT SWORD');
    await runs(RETURN);

    expect(onScreen()).not.toContain('WILL YOU INVOKE');
  });
});
