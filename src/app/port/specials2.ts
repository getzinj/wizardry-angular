// Wiz1B.DSK/SPECIALS2.TEXT.txt - SPCMISC, which is everything a special square can do, and the
// SPECIALS segment's own body, which the original keeps at the end of this file.
//
// A maze level carries a handful of numbered behaviours rather than one per square: each square
// holds a tag, the tag picks a behaviour, and the behaviour comes with three arguments. AUX2 says
// which of the twelve things it is, AUX1 is usually the message to print, and AUX0 is whatever that
// thing needs - a monster, an item, a count of uses left, a distance, a fee.

import { ENDMSG_AT, MESSAGES_PER_BLOCK, MESSAGE_BYTES } from '../data/message-record';
import { MAZE_SIZE, SquareKind, Wall, Zone, maze } from '../data/layout/wiz-types';
import type { IMaze } from '../data/layout/wiz-types';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { rt } from '../runtime/runtime';
import { findfile, getmsgblk, getrec, putrec } from './diskio';
import { initgame, inspect } from './specials';
import type { ITwizlong } from './wiz';
import { CRETURN, Talign, Tattrib, Tstatus, Xgoto, blankmap, g } from './wiz';
import { addlongs, chr, getcharx, getkey, getstr, multlong, newlong, ord, printstr, random,
         sublongs, testlong, unitclear, write } from './wiz2';


/** SPCINDEX. The segment's own: the body sets it and SPCMISC reads it. */
let spcindex: number = 0;


/** Whether a long is zero, which is how the original compares one against a freshly cleared record. */
function iszero(longnum: ITwizlong): boolean {
  return (longnum.low === 0) && (longnum.mid === 0) && (longnum.high === 0);
}


/** SPCMISC. */
async function spcmisc(): Promise<void> {
  const strbuff: { buff: string; endmsg: boolean } = { buff: '', endmsg: false };

  /** The level the party is standing on, which is the first thing SPCMISC reads. */
  const mazeflor: IMaze = await getrec(Zone.maze, g.mazelev - 1, maze);

  let message: Uint8Array = new Uint8Array(512);
  let linecnt: number = 0;
  let msgx: number = 0;
  let msgblk: number = 0;
  let curmsgbl: number = 0;
  let msgblk0: number = 0;
  let bouncefl: number = 0;
  let aux0: number = 0;
  let aux1: number = 0;
  let aux2: number = 0;

  /**
   * DECRYPTM. Named for something it does not do: the messages are stored in plain characters and
   * this only copies one out. Twelve to a block, and the block is only re-read when it changes.
   *
   * The copy is 42 bytes into a record whose string is the first 40 of them, so the two bytes past
   * the end of the string land on the word that says whether this is the message's last line. That
   * overrun is how the flag is read.
   */
  async function decryptm(msgindex: number): Promise<void> {
    msgblk = Math.trunc(msgindex / MESSAGES_PER_BLOCK);
    msgx = MESSAGE_BYTES * (msgindex % MESSAGES_PER_BLOCK);

    if (msgblk !== curmsgbl) {
      message = await getmsgblk(msgblk0 + msgblk);
      curmsgbl = msgblk;
    }

    // The original prints whatever the length byte says, and STRBUFF.BUFF holds 40 bytes with
    // ENDMSG's two after it, so a length of 39 to 41 prints the pad byte and the flag as text.
    // Past 41 it read beyond the record altogether, which is where this stops instead.
    const length: number = Math.min(message[msgx], MESSAGE_BYTES - 1);
    let buff: string = '';

    for (let index: number = 1; index <= length; index++) {
      buff = buff + chr(message[msgx + index]);
    }

    strbuff.buff = buff;
    // Any non-zero word is the flag set. Which bits a UCSD BOOLEAN test actually looks at is not
    // settled by the source; every flag a real disk carries is a plain one or zero.
    strbuff.endmsg = (message[msgx + ENDMSG_AT] | (message[msgx + ENDMSG_AT + 1] << 8)) !== 0;
  }

  /** DOMSG. Prints a message line by line, a screenful at a time. */
  async function domsg(msglinex_: number, pressret: boolean): Promise<void> {
    let msglinex: number = msglinex_;

    /** DO1LINE. */
    async function do1line(): Promise<void> {
      if (linecnt === 15) {
        rt().display.hires.clrrect(13, 6, 26, 4);
        rt().display.mvcursor(19, 7);
        printstr('[RET] FOR MORE');
        unitclear();

        do {
          await getkey();
        } while (g.inchar !== chr(CRETURN));

        rt().display.hires.clrrect(13, 6, 26, 4);
        rt().display.hires.clrrect(1, 11, 38, 4);
        linecnt = 11;
      }

      await decryptm(msglinex);
      rt().display.mvcursor(1, linecnt);
      printstr(strbuff.buff);
      msglinex = msglinex + 1;
      linecnt = linecnt + 1;
    }

    linecnt = 11;

    do {
      await do1line();
    } while (!strbuff.endmsg);

    if (pressret) {
      rt().display.hires.clrrect(13, 6, 26, 4);
      rt().display.mvcursor(21, 7);
      printstr('PRESS [RET]');
      unitclear();

      do {
        await getkey();
      } while (g.inchar !== chr(CRETURN));

      rt().display.hires.clrrect(13, 6, 26, 4);
    }
  }

  /**
   * GOTITEM. Hands an item to one character, and says whether it went. A full pack refuses, and so
   * does one already holding the same thing - but only for that character: TRYGET walks on to the
   * next, so a party of six collects six copies, and a giving square is not one of the three kinds
   * that can be used up. Nothing here stops it being farmed.
   */
  function gotitem(charx: number, itemx: number): boolean {
    let gotitem_: boolean = false;

    withExitSync('GOTITEM', (): void => {
      const who = g.charactr[charx];

      if (who.possessions.count === 8) {
        exit('GOTITEM');
      }

      for (let possx: number = 1; possx <= who.possessions.count; possx++) {
        if (who.possessions.items[possx - 1].objectIndex === itemx) {
          exit('GOTITEM');
        }
      }

      rt().display.hires.clrrect(1, 11, 38, 4);
      rt().display.mvcursor(1, 11);
      printstr(who.name);
      printstr(' GOT ITEM');

      const possx: number = who.possessions.count + 1;

      who.possessions.count = possx;
      who.possessions.items[possx - 1].objectIndex = itemx;
      who.possessions.items[possx - 1].equipped = false;
      who.possessions.items[possx - 1].cursed = false;
      gotitem_ = true;
    });

    return gotitem_;
  }

  /** TRYGET. Down the party until somebody can carry it. */
  function tryget(): void {
    let gotone: boolean = false;

    for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
      if (!gotone) {
        gotone = gotitem(charx, aux0);
      }
    }
  }

  /** WHOWADE. Somebody steps into the water, or whatever it is, and takes what comes. */
  async function whowade(): Promise<void> {
    await withExit('WHOWADE', async (): Promise<void> => {
      let wadex: number = 0;

      /** MAKWORSE. Only ever downwards: a worse state sticks, a better one is ignored. */
      function makworse(thisstat: Tstatus): void {
        if (thisstat > g.charactr[wadex].status) {
          g.charactr[wadex].status = thisstat;
        }
      }

      rt().display.hires.clrrect(1, 11, 38, 4);
      rt().display.mvcursor(2, 12);
      printstr('#) TO WADE, [RET] EXITS');
      wadex = await getcharx(false, '');

      if (wadex < 0) {
        exit('WHOWADE');
      }

      // Minus one means the square has no fixed outcome and rolls one each time.
      if (aux0 === -1) {
        aux0 = random() % 7;
      }

      const who = g.charactr[wadex];

      if (aux0 === 0) {
        if (who.status < Tstatus.dead) {
          who.status = Tstatus.ok;
          who.maximumHitPoints = who.maximumHitPoints - 8;
          who.hitPoints = who.maximumHitPoints;

          if (who.maximumHitPoints <= 0) {
            makworse(Tstatus.dead);
          }
        }
      } else if (aux0 === 1) {
        // AGE is in weeks and this subtracts a year of them, so the outcome makes the character
        // younger while taking a point of wits and a point of piety. One already down to three of
        // either dies instead.
        if ((who.attributes[Tattrib.iq] === 3) || (who.attributes[Tattrib.piety] === 3)) {
          makworse(Tstatus.dead);
        } else {
          who.age = who.age - 52;
          who.attributes[Tattrib.iq] = who.attributes[Tattrib.iq] - 1;
          who.attributes[Tattrib.piety] = who.attributes[Tattrib.piety] - 1;
        }
      } else if (aux0 === 2) {
        who.lostLocation[0] = 1;
      } else if (aux0 === 3) {
        makworse(Tstatus.asleep);
      } else if (aux0 === 4) {
        makworse(Tstatus.plyze);
      } else if (aux0 === 5) {
        makworse(Tstatus.stoned);
      } else if (aux0 === 6) {
        if (who.status === Tstatus.dead) {
          if ((random() % 10) < 3) {
            who.status = Tstatus.ok;
            who.hitPoints = who.maximumHitPoints;
          } else {
            who.status = Tstatus.ashes;
          }
        }
      }
    });
  }

  /** BOUNCEBK. Back the way they came, and round the edge of the level if that is where it is. */
  async function bouncebk(): Promise<void> {
    if (g.directio === 0) {
      g.mazey = g.mazey - 1;
    } else if (g.directio === 1) {
      g.mazex = g.mazex - 1;
    } else if (g.directio === 2) {
      g.mazey = g.mazey + 1;
    } else if (g.directio === 3) {
      g.mazex = g.mazex + 1;
    }

    g.mazey = (g.mazey + MAZE_SIZE) % MAZE_SIZE;
    g.mazex = (g.mazex + MAZE_SIZE) % MAZE_SIZE;

    if (aux1 >= 0) {
      await domsg(aux1, false);
    }
  }

  /** GETYN. A square worth searching: either something is waiting in it, or something is hidden. */
  async function getyn(): Promise<void> {
    rt().display.hires.clrrect(1, 11, 38, 4);
    rt().display.mvcursor(1, 11);
    printstr('SEARCH (Y/N) ?');

    do {
      await getkey();
    } while ((g.inchar !== 'Y') && (g.inchar !== 'N'));

    if (g.inchar === 'N') {
      exit('SPECIALS');
    }

    if (aux0 > 0) {
      g.attk012 = 0;
      g.enemyinx = aux0;
      g.xgoto = Xgoto.xcombat;
    } else {
      aux0 = Math.abs(aux0);
      tryget();
    }
  }

  /** ITM2PASS. A door that only opens for whoever is carrying the right thing. */
  async function itm2pass(): Promise<void> {
    for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
      const who = g.charactr[charx];

      for (let posx: number = 1; posx <= who.possessions.count; posx++) {
        if (who.possessions.items[posx - 1].objectIndex === aux0) {
          exit('SPECIALS');
        }
      }
    }

    await bouncebk();
  }

  /**
   * CHKALIGN. A door that turns away whole alignments. The party is walked through one at a time
   * and BOUNCEBK is called for every one that is refused, so a party of several refused characters
   * is bounced several times - and each bounce moves them another square back.
   */
  async function chkalign(): Promise<void> {
    for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
      const align: Talign = g.charactr[charx].alignment;

      if (align === Talign.good) {
        if ((aux0 === 0) || (aux0 === 2) || (aux0 === 4) || (aux0 === 6)) {
          await bouncebk();
        }
      } else if (align === Talign.neutral) {
        if ((aux0 === 0) || (aux0 === 1) || (aux0 === 4) || (aux0 === 5)) {
          await bouncebk();
        }
      } else if (align === Talign.evil) {
        if (aux0 < 4) {
          await bouncebk();
        }
      }
    }
  }

  /** CHKAUX0. Light, darkness, or a change to everybody's armour class. */
  function chkaux0(): void {
    if (aux0 === 99) {
      g.light = g.light + 50;
    } else if (aux0 === -99) {
      g.light = 0;
    } else {
      g.acmod2 = aux0;
    }
  }

  /** BCK2SHOP. Out of the maze altogether. */
  function bck2shop(): void {
    g.mazelev = 0;
    write(chr(12));
    g.xgoto = Xgoto.xnewmaze;
  }

  /** RIDDLES. The answer is a message on the disk, compared against what was typed. */
  async function riddles(): Promise<void> {
    rt().display.hires.clrrect(1, 11, 38, 4);
    rt().display.mvcursor(1, 11);
    printstr('ANSWER ?');

    const answer: string = await getstr(1, 13);

    await decryptm(aux0);
    rt().display.hires.clrrect(1, 11, 38, 4);
    rt().display.mvcursor(1, 11);

    if (strbuff.buff !== answer) {
      aux1 = -1;
      printstr('WRONG!');
      await bouncebk();
    } else {
      printstr('RIGHT!');
    }
  }

  /** FEEIS. A toll. The amount is a message, and a letter in front of it says where paying leads. */
  async function feeis(): Promise<void> {
    let goldtot: ITwizlong = newlong();
    let fee: ITwizlong = newlong();

    /**
     * FEE2LONG. The message is the number, read a digit at a time. A letter before it is not part
     * of the amount: it names which of the level's behaviours paying moves the party to.
     */
    function fee2long(): void {
      if (strbuff.buff.substring(0, 1) >= '@') {
        bouncefl = ord(strbuff.buff.substring(0, 1)) - ord('A') + 1;
        strbuff.buff = strbuff.buff.substring(1);
      } else {
        bouncefl = 0;
      }

      fee = newlong();

      const mult10: number = 10;

      for (let strx: number = 1; strx <= strbuff.buff.length; strx++) {
        multlong(fee, mult10);
        fee.low = fee.low + ord(strbuff.buff.substring(strx - 1, strx)) - ord('0');
      }
    }

    /** CHKGOLD. The whole party's gold together has to cover it. */
    async function chkgold(): Promise<void> {
      await withExit('CHKGOLD', async (): Promise<void> => {
        goldtot = newlong();

        for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
          addlongs(goldtot, g.charactr[charx].gold);
        }

        if (testlong(goldtot, fee) !== -1) {
          exit('CHKGOLD');
        }

        printstr('NOT ENOUGH $');

        if (bouncefl === 0) {
          await bouncebk();
        }

        exit('SPECIALS');
      });
    }

    /** PAYGOLD. Emptied one purse at a time, in marching order, until the fee is met. */
    function paygold(): void {
      goldtot = newlong();

      for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
        if (!iszero(fee)) {
          if (testlong(fee, g.charactr[charx].gold) === 1) {
            sublongs(fee, g.charactr[charx].gold);
            g.charactr[charx].gold = newlong();
          } else {
            sublongs(g.charactr[charx].gold, fee);
            fee = newlong();
          }
        }
      }

      printstr('THANKS!');
    }

    await decryptm(aux0);
    fee2long();
    rt().display.hires.clrrect(1, 11, 38, 4);
    rt().display.mvcursor(1, 11);
    printstr('FEE IS ');
    printstr(strbuff.buff);
    rt().display.mvcursor(1, 13);
    printstr('PAY (Y/N) ?');

    do {
      await getkey();
    } while ((g.inchar !== 'Y') && (g.inchar !== 'N'));

    aux1 = -1;

    if (g.inchar === 'N') {
      if (bouncefl === 0) {
        await bouncebk();
      }

      exit('SPECIALS');
    } else {
      rt().display.hires.clrrect(1, 11, 38, 4);
      rt().display.mvcursor(1, 11);
      await chkgold();
      paygold();

      if (bouncefl > 0) {
        g.mazex = mazeflor.argument2[bouncefl];
        g.mazey = mazeflor.argument1[bouncefl];
        g.mazelev = mazeflor.argument0[bouncefl];
        g.xgoto = Xgoto.xnewmaze;
      }
    }
  }

  /**
   * LOOKOUT. A square that wakes everything for AUX0 squares around it, which is how a level has
   * places it is dangerous to linger. The square itself is cleared again afterwards.
   */
  function lookout(): void {
    for (let x2: number = -aux0; x2 <= aux0; x2++) {
      for (let y2: number = -aux0; y2 <= aux0; y2++) {
        const x: number = (g.mazex + x2 + MAZE_SIZE) % MAZE_SIZE;
        const y: number = (g.mazey + y2 + MAZE_SIZE) % MAZE_SIZE;

        // A reach wider than the level takes the remainder negative, which the original wrote
        // through into whatever lay before FIGHTMAP and carried on. Indexing past a decoded array
        // throws, so anything off the grid is dropped rather than stopping the segment.
        if (g.fightmap[x] != null) {
          g.fightmap[x][y] = true;
        }
      }
    }

    g.fightmap[g.mazex][g.mazey] = false;
  }

  /**
   * SWITCHLOC. Where a party that ran away from a fight ends up, and the only one of these that
   * runs before the screen is touched. It walks them out through doors at random until the walk
   * runs out of luck, leaves them facing a random way with no idea where they are, and sets XGOTO2
   * to XCOMBAT so the next thing that happens is another fight.
   *
   * This is not the spinner, which is a square kind of its own: RUNNER dispatches SPINNER to
   * SPINDIR, which only turns the party and redraws. What reaches here is a behaviour index of
   * zero, and the one thing that produces that is REWARDS' XREWARD2 arm, which RUNAWAY sends the
   * party to after a successful flee.
   */
  function switchloc(): void {
    let beenhere: boolean[][] = blankmap();
    let doorcnt: number = 0;

    /**
     * SWITCH. Nothing calls this, in the original or here, but the original declares it so it is
     * carried across: two VAR INTEGER parameters swapped through a local. Pascal passes scalars by
     * reference and TypeScript cannot, so the pair arrives as one holder to keep the shape honest.
     * The trailing underscore is forced - switch is a reserved word.
     */
    function switch_(holder: { first: number; second: number }): void {
      const save: number = holder.first;

      holder.first = holder.second;
      holder.second = save;
    }

    /** FINDDOOR. */
    function finddoor(): void {
      withExitSync('FINDDOOR', (): void => {
        let limitmov: number = 0;

        /**
         * The original names this one only by its code number, having run out of names. It walks
         * the room the party is in and says whether it found a door out of it.
         */
        function p010328(x: number, y: number): boolean {
          let p010328_: boolean = false;

          withExitSync('P010328', (): void => {

            /** TRYADJ. */
            function tryadj(x_: number, y_: number): void {
              withExitSync('TRYADJ', (): void => {

                /** CHK4DOOR. A hidden door is only found about a third of the time. */
                function chk4door(walltype: Wall, movetox_: number, movetoy_: number): void {
                  withExitSync('CHK4DOOR', (): void => {
                    if ((walltype === Wall.open) || (walltype === Wall.wall)) {
                      exit('CHK4DOOR');
                    }

                    if (walltype === Wall.hiddenDoor) {
                      if ((random() % 100) < 65) {
                        exit('CHK4DOOR');
                      }
                    }

                    const movetox: number = (movetox_ + MAZE_SIZE) % MAZE_SIZE;
                    const movetoy: number = (movetoy_ + MAZE_SIZE) % MAZE_SIZE;

                    // UCSD evaluates both operands of an OR, which is the rule this port applies
                    // throughout, so the draw happens even on the first door, where the count alone
                    // decides the test. Two draws per walk ride on it.
                    const fresh: boolean = !beenhere[movetox][movetoy];
                    const lucky: boolean = (random() % 100) > (65 - limitmov);

                    if ((doorcnt === 0) || (fresh && lucky)) {
                      g.savex = x;
                      g.savey = y;
                      g.mazex = movetox;
                      g.mazey = movetoy;
                      doorcnt = doorcnt + 1;
                      p010328_ = true;
                      exit('P010328');
                    }
                  });
                }

                const x: number = (x_ + MAZE_SIZE) % MAZE_SIZE;
                const y: number = (y_ + MAZE_SIZE) % MAZE_SIZE;

                if (beenhere[x][y]) {
                  exit('TRYADJ');
                }

                // Another special square stops the walk dead and leaves the party standing on it.
                if (mazeflor.squareKind[mazeflor.squareTag[x][y]] !== SquareKind.normal) {
                  g.mazex = x;
                  g.mazey = y;
                  exit('FINDDOOR');
                }

                beenhere[x][y] = true;

                chk4door(mazeflor.northWalls[x][y], x, y + 1);
                chk4door(mazeflor.southWalls[x][y], x, y - 1);
                chk4door(mazeflor.eastWalls[x][y], x + 1, y);
                chk4door(mazeflor.westWalls[x][y], x - 1, y);

                if (mazeflor.northWalls[x][y] === Wall.open) {
                  tryadj(x, y + 1);
                }

                if (mazeflor.westWalls[x][y] === Wall.open) {
                  tryadj(x - 1, y);
                }

                if (mazeflor.eastWalls[x][y] === Wall.open) {
                  tryadj(x + 1, y);
                }

                if (mazeflor.southWalls[x][y] === Wall.open) {
                  tryadj(x, y - 1);
                }
              });
            }

            p010328_ = false;
            tryadj(x, y);
          });

          return p010328_;
        }

        // The same rule again: the draw happens on the first turn too, where the door count is
        // what ends the test.
        for (;;) {
          const first: boolean = doorcnt === 0;
          const unlucky: boolean = (random() % 65) > limitmov;

          if (first || unlucky) {
            if (!p010328(g.mazex, g.mazey)) {
              exit('FINDDOOR');
            }

            limitmov = limitmov + 10;
          } else {
            break;
          }
        }
      });
    }

    g.xgoto2 = Xgoto.xcombat;
    g.xgoto = Xgoto.xrunner;
    beenhere = blankmap();
    doorcnt = 0;
    mazeflor.squareTag[g.mazex][g.mazey] = 0;
    finddoor();
    g.directio = random() % 4;
    exit('SPECIALS');
  }

  bouncefl = spcindex;

  // A behaviour index of zero is the party arriving from a flee, and the one arm here that runs
  // before anything is drawn. (Several of the others print nothing either - this one is first.)
  if (bouncefl === 0) {
    switchloc();
  }

  g.xgoto2 = Xgoto.xscnmsg;
  rt().display.hires.clrrect(1, 11, 38, 4);

  // FINDFILE, which the port answers from the disk the player brought rather than by walking a
  // directory, though the walk is still paid for. Block zero of the file either way, so the
  // arithmetic below is the original's.
  msgblk0 = (await findfile()) ? 0 : -1;

  if (msgblk0 < 0) {
    rt().display.mvcursor(1, 11);
    printstr('MESGS LOST');
    exit('SPECIALS');
  }

  curmsgbl = 0;
  message = await getmsgblk(msgblk0);
  aux2 = mazeflor.argument2[bouncefl];
  aux1 = mazeflor.argument1[bouncefl];
  aux0 = mazeflor.argument0[bouncefl];
  g.xgoto = Xgoto.xrunner;

  if (aux2 === 0) {
    exit('SPECIALS');
  }

  // The three kinds that can be used up. A positive AUX0 counts down, and when the last one goes
  // the behaviour becomes NORMAL - which clears it for every square sharing that tag, not just
  // this one, since SQRETYPE is indexed by the tag. Only kind 4 reads a negative count, and it
  // splits at -1000: down to -999 is a one-shot that zeroes the stored count, while -1000 and
  // below leaves the disk alone and adds the thousand back locally, so that square keeps working.
  if ((aux2 === 1) || (aux2 === 4) || (aux2 === 8)) {
    if (aux0 === 0) {
      exit('SPECIALS');
    } else {
      if (aux2 !== 4) {
        if (aux0 > 0) {
          mazeflor.argument0[bouncefl] = aux0 - 1;
        }

        if (aux0 === 1) {
          mazeflor.squareKind[bouncefl] = SquareKind.normal;
        }
      } else if (aux0 < 0) {
        if (aux0 > -1000) {
          mazeflor.argument0[bouncefl] = 0;
        } else {
          aux0 = aux0 + 1000;
        }
      }

      await putrec(Zone.maze, g.mazelev - 1, maze, mazeflor);
    }
  }

  rt().display.hires.clrrect(1, 11, 38, 4);

  // Five and six say nothing of their own: they are the two that only let the party through or
  // turn them back. Everything else prints, and some wait for a key afterwards.
  if (!((aux2 === 5) || (aux2 === 6))) {
    await domsg(aux1,
                (aux2 === 2) || (aux2 === 3) || (aux2 === 4) ||
                (aux2 === 10) || (aux2 === 11) || (aux2 === 12));
  }

  if (aux2 === 2) {
    tryget();
  } else if (aux2 === 3) {
    await whowade();
  } else if (aux2 === 4) {
    await getyn();
  } else if (aux2 === 5) {
    await itm2pass();
  } else if (aux2 === 6) {
    await chkalign();
  } else if (aux2 === 7) {
    chkaux0();
  } else if (aux2 === 8) {
    bck2shop();
  } else if (aux2 === 9) {
    lookout();
  } else if (aux2 === 10) {
    await riddles();
  } else if (aux2 === 11) {
    await feeis();
  }
}


/**
 * SEGMENT PROCEDURE SPECIALS. Three jobs. Coming here as XINSAREA is the party looking round the
 * room they are standing in, and that one leaves by its own door. Otherwise LLBASE04 says which of
 * the other two it is: negative is the boot or the party being disbanded at the camp, which only
 * wants the screen put back, and anything else is a special square.
 *
 * XGOTO comes from XGOTO2 before either of the other two runs, so whoever sent the party here
 * decides where they go next - which is how the maze gets them back after a scenario message, and
 * the Edge of Town after one of its own.
 */
export async function specials(): Promise<void> {
  await withExit('SPECIALS', async (): Promise<void> => {
    if (g.xgoto === Xgoto.xinsarea) {
      await inspect();
    }

    g.xgoto = g.xgoto2;
    spcindex = g.llbase04;

    if (spcindex < 0) {
      await initgame();
    } else {
      await spcmisc();
    }
  });
}
