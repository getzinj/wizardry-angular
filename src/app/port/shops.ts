// Wiz1B.DSK/SHOPS.TEXT.txt - the Temple of Radiant Cant and Boltac's Trading Post.
//
// Both are reached from the castle and both come back to it. The temple raises the dead, for a
// donation that goes up with the level of whoever is being raised, and can fail: a dead character
// who fails becomes ashes, and ashes that fail are lost for good. Boltac's buys, sells, uncurses
// and identifies, and its stock is finite and kept on the disk - buy the last plate mail and
// nobody else will ever buy one.

import { Zone, character, object } from '../data/layout/wiz-types';
import type { ICharacter, IObject } from '../data/layout/wiz-types';
import type { IWizardryLong } from '../data/layout/ucsd-layout';
import { exit, withExit } from '../runtime/pascal-exit';
import { getrec, putrec } from './diskio';
import { CRETURN, Tattrib, Tstatus, Xgoto, blankchar, g } from './wiz';
import {
  addlongs, chr, divlong, getcharx, getkey, getline, gotoxy, multlong, newlong, ord, pause2,
  prntlong, random, sublongs, testlong, write, writeln, centstr
} from './wiz2';

/** What Boltac's shows at once, and the length of OBJLIST as it is declared. */
const SHELF: number = 6;

/**
 * OBJLIST is ARRAY[ 1..6], but LISTPOSS fills one entry per carried item and a character can carry
 * eight. With range checking off the seventh and eighth run past the end into the two unused
 * locals declared after it, and TRANSACT reads them back out again, so it works - POSSCNT sits
 * one beyond those and survives. Room for exactly eight is how that is reproduced.
 */
const OBJLIST_SLOTS: number = 8;

// SELLIDUN's ACTION.
const SELL: number = 0;
const UNCURSE: number = 1;
const IDENTIFY: number = 2;


/** CANT. */
async function cant(): Promise<void> {
  await withExit('CANT', async (): Promise<void> => {
    let whohelp: number = 0;
    let whopay: number = 0;
    let who: ICharacter = blankchar();

    async function cantshop(): Promise<void> {
      await withExit('CANTSHOP', async (): Promise<void> => {
        async function dsp2str(str1: string, str2: string): Promise<void> {
          await centstr(`** ${ str1 }${ str2 } **`);
          exit('CANTSHOP');
        }

        async function welcome(): Promise<void> {
          gotoxy(0, 13);
          write(chr(11));
          writeln(' WELCOME TO THE TEMPLE OF RADIANT CANT!');
          writeln();
          write('WHO ARE YOU HELPING ? >');

          const disabled: string = await getline();

          if (disabled === '') {
            exit('CANT');
          }

          let whohelpx: number = 0;

          who = await getrec(Zone.character, whohelpx, character);

          while ((whohelpx < g.scntoc.recordsOnDisk[Zone.character]) && (disabled !== who.name)) {
            whohelpx = whohelpx + 1;
            who = await getrec(Zone.character, whohelpx, character);
          }

          if (whohelpx === g.scntoc.recordsOnDisk[Zone.character]) {
            await dsp2str('', 'WHO?');
          }

          if (((who.lostLocation[0] + who.lostLocation[1] + who.lostLocation[2]) !== 0)
              || who.inMaze) {
            await dsp2str(who.name, ' IS NOT HERE');
          }

          if (who.status === Tstatus.lost) {
            await dsp2str(who.name, ' IS LOST');
          }

          if (who.status === Tstatus.ok) {
            await dsp2str(who.name, ' IS OK');
          }

          whohelp = whohelpx;
        }

        async function paycant(): Promise<void> {
          const payamt: IWizardryLong = newlong(0, 0, 0);

          async function getpayer(): Promise<void> {
            payamt.high = 0;
            payamt.mid = 0;

            switch (who.status) {
              case Tstatus.plyze:  payamt.low = 100; break;
              case Tstatus.stoned: payamt.low = 200; break;
              case Tstatus.dead:   payamt.low = 250; break;
              case Tstatus.ashes:  payamt.low = 500; break;

              // The original's CASE has no arm for AFRAID or ASLEEP and no OTHERWISE, so on those
              // it would donate whatever happened to be on the stack. WELCOME has already turned
              // away anyone who is well or lost, and combat clears both of those before the party
              // reaches town, so nothing on a disk the game wrote can arrive here.
              default: break;
            }

            multlong(payamt, who.level);
            gotoxy(0, 17);
            write(chr(11), 'THE DONATION WILL BE ');
            prntlong(payamt);
            writeln();
            whopay = await getcharx(false, 'WHO WILL TITHE');

            if (whopay === -1) {
              exit('CANTSHOP');
            }

            if (testlong(payamt, g.charactr[whopay].gold) > 0) {
              await dsp2str('', 'CHEAP APOSTATES! OUT!');
            }

            sublongs(g.charactr[whopay].gold, payamt);
          }

          /** DOCANT. The prayer itself, which can leave the character worse off than it found them. */
          async function docant(): Promise<void> {
            async function ashlost(): Promise<void> {
              who.status = (who.status === Tstatus.dead) ? Tstatus.ashes : Tstatus.lost;
              who.inMaze = false;
              await putrec(Zone.character, whohelp, character, who);
              writeln();

              if (who.status === Tstatus.lost) {
                await dsp2str(who.name, ' WILL BE BURIED');
              } else {
                await dsp2str(who.name, ' NEEDS KADORTO NOW');
              }
            }

            gotoxy(0, 17);
            write(chr(11), 'MURMUR - ');
            await pause2();
            write('CHANT - ');
            await pause2();
            write('PRAY - ');
            await pause2();
            write('INVOKE!');
            writeln();

            if (who.status === Tstatus.dead) {
              if ((random() % 100) > (50 + (3 * who.attributes[Tattrib.vitality]))) {
                await ashlost();
              } else {
                who.hitPoints = 1;
              }
            } else if (who.status === Tstatus.ashes) {
              if ((random() % 100) > (40 + (3 * who.attributes[Tattrib.vitality]))) {
                await ashlost();
              } else {
                who.hitPoints = who.maximumHitPoints;
              }
            }

            who.age = who.age + (random() % 52) + 1;
            who.status = Tstatus.ok;
            await putrec(Zone.character, whohelp, character, who);
            writeln();
            await dsp2str(who.name, ' IS WELL');
          }

          await getpayer();
          await docant();
        }

        await welcome();
        await paycant();
      });
    }

    g.xgoto = Xgoto.xcastle;

    for (;;) {
      await cantshop();
    }
  });
}


/** BOLTAC. */
async function boltac(): Promise<void> {
  await withExit('BOLTAC', async (): Promise<void> => {
    const halfpric: number = 2;
    let inventx: number = 0;
    let chari: number = 0;
    // Declared but not read until something fills it, as the original's local TOBJREC is.
    let objectr!: IObject;

    async function doplayer(): Promise<void> {
      await withExit('DOPLAYER', async (): Promise<void> => {
        const objlist: number[] = new Array<number>(OBJLIST_SLOTS + 1).fill(0);
        let posscnt: number = 0;

        function shelfline(x: number, at: number): void {
          objlist[x] = at;
          write([ x, 1 ], ')', [ objectr.name, 15 ], ' ');
          prntlong(objectr.price);

          if (objectr.usableByClass[g.charactr[chari].characterClass] === 0) {
            write(' UNUSABLE');
          }
        }

        /**
         * SCROLPOS and SCROLNEG. Boltac's stock is a ring: paging past the end comes round to the
         * start again, and anything he has none of, or that is cursed, is passed over. He is never
         * out of everything, so the search always finds something - on a real disk.
         */
        async function scrolpos(): Promise<void> {
          inventx = objlist[SHELF] - 1;

          for (let x: number = 1; x <= SHELF; x++) {
            gotoxy(0, 12 + x);
            write(chr(29));

            do {
              inventx = inventx + 1;

              if (inventx >= g.scntoc.recordsOnDisk[Zone.object]) {
                inventx = 1;
              }

              objectr = await getrec(Zone.object, inventx, object);
            } while (!((objectr.stock !== 0) && !objectr.cursed));

            shelfline(x, inventx);
          }
        }

        async function scrolneg(): Promise<void> {
          inventx = objlist[1] + 1;

          for (let x: number = SHELF; x >= 1; x--) {
            gotoxy(0, 12 + x);
            write(chr(29));

            do {
              inventx = inventx - 1;

              if (inventx < 1) {
                inventx = g.scntoc.recordsOnDisk[Zone.object] - 1;
              }

              objectr = await getrec(Zone.object, inventx, object);
            } while (!((objectr.stock !== 0) && !objectr.cursed));

            shelfline(x, inventx);
          }
        }

        async function dobuy(): Promise<void> {
          let notpurch: boolean = true;
          let scroldir: number = 1;
          let buyx: number = 0;

          async function purchase(): Promise<void> {
            await withExit('PURCHASE', async (): Promise<void> => {
              async function aastraa(astr: string): Promise<void> {
                await centstr(`** ${ astr } **`);
                exit('PURCHASE');
              }

              do {
                notpurch = false;
                gotoxy(0, 21);
                writeln(chr(11));
                write('PURCHASE WHICH ITEM ([RETURN] EXITS) ? >');
                await getkey();
                buyx = ord(g.inchar) - ord('0');

                if (g.inchar === chr(CRETURN)) {
                  exit('PURCHASE');
                }
              } while (!((buyx > 0) && (buyx <= SHELF)));

              objectr = await getrec(Zone.object, objlist[buyx], object);

              if (objectr.stock === 0) {
                await aastraa('YOU BOUGHT THE LAST ONE');
              } else if (g.charactr[chari].possessions.count === 8) {
                await aastraa('YOU CANT CARRY ANYTHING MORE');
              } else if (testlong(g.charactr[chari].gold, objectr.price) < 0) {
                await aastraa('YOU CANNOT AFFORD IT');
              }

              if (objectr.usableByClass[g.charactr[chari].characterClass] === 0) {
                gotoxy(0, 22);
                write(chr(11), 'UNUSABLE ITEM - CONFIRM BUY (Y/N) ? >');

                do {
                  await getkey();
                } while (!((g.inchar === 'Y') || (g.inchar === 'N')));

                if (g.inchar === 'N') {
                  await aastraa('WE ALL MAKE MISTAKES');
                }
              } else {
                g.inchar = ' ';
              }

              sublongs(g.charactr[chari].gold, objectr.price);

              const insertx: number = g.charactr[chari].possessions.count + 1;
              const slot: ICharacter['possessions']['items'][number] =
                g.charactr[chari].possessions.items[insertx - 1];

              slot.equipped = false;
              slot.identified = true;
              slot.cursed = false;
              slot.objectIndex = objlist[buyx];
              g.charactr[chari].possessions.count = insertx;

              if (objectr.stock > 0) {
                objectr.stock = objectr.stock - 1;
              }

              await putrec(Zone.object, objlist[buyx], object, objectr);

              if (ord(g.inchar) === ord('Y')) {
                await aastraa('ITS YOUR MONEY');
              } else {
                await aastraa('JUST WHAT YOU NEEDED');
              }
            });
          }

          inventx = 1;
          notpurch = true;
          objlist[1] = 1;
          objlist[SHELF] = 1;
          scroldir = 1;
          gotoxy(0, 13);
          write(chr(11));

          do {
            if (notpurch) {
              if (scroldir === 1) {
                await scrolpos();
              } else {
                await scrolneg();
              }
            }

            notpurch = true;
            scroldir = 1;
            gotoxy(0, 20);
            write(chr(11), 'YOU HAVE ');
            prntlong(g.charactr[chari].gold);
            writeln(' GOLD');
            writeln('YOU MAY P)URCHASE, SCROLL');
            write([ ' ', 8 ]);
            writeln('F)ORWARD OR B)ACK, GO TO THE');
            write([ ' ', 8 ]);
            write('S)TART, OR L)EAVE');
            gotoxy(41, 0);

            do {
              await getkey();
            } while (!((g.inchar === 'P') || (g.inchar === 'F') || (g.inchar === 'B')
                    || (g.inchar === 'S') || (g.inchar === 'L')));

            switch (g.inchar) {
              case 'P': await purchase(); break;
              case 'S': objlist[SHELF] = 1; break;
              case 'B': scroldir = -1; break;
              default: break;
            }
          } while (g.inchar !== 'L');
        }

        /** SELLIDUN. Selling, uncursing and identifying are the same screen with a different verb. */
        async function sellidun(action: number): Promise<void> {
          await withExit('SELLIDUN', async (): Promise<void> => {
            let tranobjx: number = 0;

            async function listposs(): Promise<void> {
              gotoxy(0, 13);
              write(chr(11));
              posscnt = g.charactr[chari].possessions.count;

              for (tranobjx = 1; tranobjx <= posscnt; tranobjx++) {
                const held: ICharacter['possessions']['items'][number] =
                  g.charactr[chari].possessions.items[tranobjx - 1];

                objlist[tranobjx] = held.objectIndex;
                objectr = await getrec(Zone.object, objlist[tranobjx], object);
                write([ tranobjx, 1 ], chr(41),
                      [ held.identified ? objectr.name : objectr.unidentifiedName, 15 ], ' ');
                divlong(objectr.price, halfpric);

                if (action === SELL) {
                  if (!held.identified) {
                    objectr.price.high = 0;
                    objectr.price.mid = 0;
                    objectr.price.low = 1;
                  }
                }

                prntlong(objectr.price);
                writeln();
              }
            }

            async function transact(): Promise<void> {
              await withExit('TRANSACT', async (): Promise<void> => {
                async function aastraa(astr: string): Promise<void> {
                  await centstr(astr);
                  exit('TRANSACT');
                }

                const held: ICharacter['possessions']['items'][number] =
                  g.charactr[chari].possessions.items[tranobjx - 1];

                objectr = await getrec(Zone.object, objlist[tranobjx], object);
                divlong(objectr.price, halfpric);

                if (action === SELL) {
                  if (!held.identified) {
                    objectr.price.high = 0;
                    objectr.price.mid = 0;
                    objectr.price.low = 1;
                  }

                  if (held.cursed) {
                    await aastraa('** WE DONT BUY CURSED ITEMS **');
                  }
                } else {
                  if (!held.cursed && (action === UNCURSE)) {
                    await aastraa('** THAT IS NOT A CURSED ITEM **');
                  }

                  if (held.identified && (action === IDENTIFY)) {
                    await aastraa('** THAT HAS BEEN IDENTIFIED **');
                  }

                  if (testlong(g.charactr[chari].gold, objectr.price) < 0) {
                    await aastraa('** YOU CANT AFFORD THE FEE **');
                  }
                }

                if (action === SELL) {
                  addlongs(g.charactr[chari].gold, objectr.price);
                } else {
                  sublongs(g.charactr[chari].gold, objectr.price);
                }

                if (action === IDENTIFY) {
                  held.identified = true;
                } else {
                  const carried: ICharacter['possessions'] = g.charactr[chari].possessions;

                  if (tranobjx < carried.count) {
                    for (let possx: number = tranobjx + 1; possx <= carried.count; possx++) {
                      // A record assignment in Pascal: the fields are copied into the slot that
                      // is already there, rather than the slot being replaced.
                      Object.assign(carried.items[possx - 2], carried.items[possx - 1]);
                    }
                  }

                  carried.count = carried.count - 1;
                  objectr = await getrec(Zone.object, objlist[tranobjx], object);

                  if (action === SELL) {
                    if (objectr.stock > -1) {
                      objectr.stock = objectr.stock + 1;
                    }
                  }

                  await putrec(Zone.object, objlist[tranobjx], object, objectr);
                }

                await centstr('** ANYTHING ELSE, SIRE? **');
                await listposs();
              });
            }

            await listposs();

            for (;;) {
              if (posscnt === 0) {
                exit('SELLIDUN');
              }

              gotoxy(0, 22);
              write(chr(11));

              if (action === SELL) {
                write('WHICH DO YOU WISH TO SELL ? >');
              } else if (action === UNCURSE) {
                write('WHICH DO YOU WISH UNCURSED ? >');
              } else {
                write('WHICH DO YOU WISH IDENTIFIED ? >');
              }

              await getkey();

              if (ord(g.inchar) === CRETURN) {
                exit('SELLIDUN');
              }

              tranobjx = ord(g.inchar) - ord('0');

              if ((tranobjx > 0) && (tranobjx <= posscnt)) {
                await transact();
              }
            }
          });
        }

        for (;;) {
          gotoxy(0, 13);
          write(chr(11), '      WELCOME ', g.charactr[chari].name);
          writeln();
          write('     YOU HAVE ');
          prntlong(g.charactr[chari].gold);
          writeln(' GOLD');
          writeln();
          writeln('YOU MAY B)UY  AN ITEM,');
          writeln('        S)ELL AN ITEM, HAVE AN ITEM');
          writeln('        U)NCURSED,  OR HAVE AN ITEM');
          writeln('        I)DENTIFIED, OR L)EAVE');
          gotoxy(41, 0);
          await getkey();

          switch (g.inchar) {
            case 'U': await sellidun(UNCURSE); break;
            case 'I': await sellidun(IDENTIFY); break;
            case 'S': await sellidun(SELL); break;
            case 'B': await dobuy(); break;
            case 'L': exit('DOPLAYER'); break;
            default: break;
          }
        }
      });
    }

    g.xgoto = Xgoto.xcastle;

    for (;;) {
      gotoxy(0, 13);
      write(chr(11), '       WELCOME TO THE TRADING POST');
      writeln();
      chari = await getcharx(false, 'WHO WILL ENTER');

      if (chari === -1) {
        exit('SHOPS');
      }

      if (chari < g.partycnt) {
        await doplayer();
      }
    }
  });
}


export { boltac, cant };
