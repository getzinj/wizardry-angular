import { beforeEach, describe, expect, it } from 'vitest';

import { Zone, character, object } from '../data/layout/wiz-types';
import type { ICharacter, IObject } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { boot, play, rosterOf, somebody } from './port-fixture';
import { shops } from './shops2';
import { Tstatus, Xgoto, g } from './wiz';

// Boltac's stock is finite and lives on the disk: buying the last plate mail means nobody will
// ever buy one again. The temple raises the dead for a donation, and can make things worse -
// a failed raise turns a corpse to ashes, and failed ashes are lost for good.

const RETURN: string = '\r';


function withGold(name: string, gold: number): ICharacter {
  const who: ICharacter = somebody(name);

  who.gold.low = gold;

  return who;
}


function shopping(who: ICharacter): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(who);

  boot(scenario, Xgoto.xboltac);
  g.partycnt = 1;
  g.charactr[0] = who;
  g.chardisk[0] = 0;

  return scenario;
}


describe("Boltac's stock", (): void => {
  let scenario: ScenarioDisk;
  let buyer: ICharacter;

  beforeEach(async (): Promise<void> => {
    buyer = withGold('FRODO', 9000);
    scenario = shopping(buyer);

    // 1 enters the shop, B)uy, P)urchase, item 1, then leave the shelf, the shop and the town.
    await play(shops, [ '1', 'B', 'P', '1', 'L', 'L', RETURN ]);
  });

  it('hands the item over', (): void => {
    expect(buyer.possessions.count).toBe(1);
  });

  it('hands over an item that is already identified, since he says what it is', (): void => {
    expect(buyer.possessions.items[0].identified).toBe(true);
  });

  it('does not equip it', (): void => {
    expect(buyer.possessions.items[0].equipped).toBe(false);
  });

  it("takes the price out of the buyer's gold", (): void => {
    expect(buyer.gold.low).toBeLessThan(9000);
  });

  it('has one fewer of it afterwards', (): void => {
    const bought: number = buyer.possessions.items[0].objectIndex;
    const item: IObject = scenario.read(Zone.object, bought, object);
    const before: number = 1 + bought;

    expect(item.stock).toBe(before - 1);
  });

  it('writes the reduced stock to the disk, not just to memory', (): void => {
    expect(scenario.changed).toBe(true);
  });

  it('comes back to the castle', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});


describe('selling something back to Boltac', (): void => {
  let scenario: ScenarioDisk;
  let seller: ICharacter;

  beforeEach(async (): Promise<void> => {
    seller = withGold('FRODO', 9000);
    scenario = shopping(seller);
    await play(shops, [ '1', 'B', 'P', '1', 'L', 'S', '1', RETURN, 'L', RETURN ]);
  });

  it('takes the item away again', (): void => {
    expect(seller.possessions.count).toBe(0);
  });

  it('puts it back on his shelf', (): void => {
    const item: IObject = scenario.read(Zone.object, 1, object);

    expect(item.stock).toBe(1 + 1);
  });
});


describe('the Temple of Cant', (): void => {
  function ailing(status: Tstatus): { scenario: ScenarioDisk; patient: ICharacter } {
    const patient: ICharacter = somebody('BORIS');

    patient.status = status;
    patient.level = 1;
    patient.attributes = [ 10, 10, 10, 18, 10, 10 ];

    const payer: ICharacter = withGold('FRODO', 9000);
    const scenario: ScenarioDisk = rosterOf(patient, payer);

    boot(scenario, Xgoto.xcant);
    g.partycnt = 1;
    g.charactr[0] = payer;
    g.chardisk[0] = 1;

    return { scenario, patient };
  }

  it('will not take somebody who is perfectly well', async (): Promise<void> => {
    const { scenario }: { scenario: ScenarioDisk } = ailing(Tstatus.ok);

    await play(shops, [ 'B', 'O', 'R', 'I', 'S', RETURN, RETURN ]);

    expect(scenario.read(Zone.character, 0, character).status).toBe(Tstatus.ok);
  });

  it('takes the donation from whoever tithes', async (): Promise<void> => {
    ailing(Tstatus.dead);

    await play(shops, [ 'B', 'O', 'R', 'I', 'S', RETURN, '1', RETURN ]);

    expect(g.charactr[0].gold.low).toBeLessThan(9000);
  });

  it('leaves the patient alive, or as ashes, but never as they were', async (): Promise<void> => {
    const { scenario }: { scenario: ScenarioDisk } = ailing(Tstatus.dead);

    await play(shops, [ 'B', 'O', 'R', 'I', 'S', RETURN, '1', RETURN ]);

    const after: Tstatus = scenario.read(Zone.character, 0, character).status;

    expect([ Tstatus.ok, Tstatus.ashes ]).toContain(after);
  });

  it('writes whatever became of them to the disk', async (): Promise<void> => {
    const { scenario }: { scenario: ScenarioDisk } = ailing(Tstatus.dead);

    await play(shops, [ 'B', 'O', 'R', 'I', 'S', RETURN, '1', RETURN ]);

    expect(scenario.changed).toBe(true);
  });

  it('comes back to the castle when nobody is named', async (): Promise<void> => {
    ailing(Tstatus.dead);

    await play(shops, [ RETURN ]);

    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});


describe('selling the first of several things', (): void => {
  // The list is closed up over the gap by copying each record down a slot. Pascal copies fields
  // into the slot that is already there; replacing the slot instead would leave anything holding
  // on to it pointing at a thing that is no longer in the list.
  let seller: ICharacter;

  beforeEach(async (): Promise<void> => {
    seller = withGold('FRODO', 9000);
    shopping(seller);
    await play(shops, [ '1', 'B', 'P', '1', 'P', '2', 'L', 'S', '1', RETURN, 'L', RETURN ]);
  });

  it('leaves the other one behind', (): void => {
    expect(seller.possessions.count).toBe(1);
  });

  it('moves it down into the first slot', (): void => {
    expect(seller.possessions.items[0].objectIndex).not.toBe(0);
  });

  it('leaves the slot it came from as an ordinary slot, not a copy of its neighbour', (): void => {
    seller.possessions.items[0].identified = false;

    expect(seller.possessions.items[1].identified).toBe(true);
  });
});
