// Wiz1A.DSK/WIZ.TEXT.txt, the mainline.
//
// The program is nine segment procedures and a loop. A segment does a thing, sets XGOTO to say
// where the player should be next, and returns - often by throwing itself out of several nested
// procedures at once. The loop reads XGOTO and calls whichever segment owns that destination. It
// works that way because only one segment fitted in memory at a time, and it is kept because the
// control flow of the whole game is in this one table.

// CAMP's own body is at the end of the second of its two files, where the original keeps it.
import { camp } from './camp2';
import { castle } from './castle2';
// COMBAT's own body is at the end of the last of its five files, and REWARDS' at the end of the
// second of its two, which is where the original puts them.
import { combat } from './combat5';
import { rewards } from './rewards2';
import { roller } from './roller';
import { runner } from './runner2';
import { shops } from './shops2';
import { utilitie } from './utilitie';
import { specials } from './specials2';
import { Xgoto, g } from './wiz';
import { chr, getkey, gotoxy, write } from './wiz2';



/** One turn of the trampoline: run whichever segment owns wherever the player is going. */
export async function segment(): Promise<void> {
  switch (g.xgoto) {
    case Xgoto.xscnmsg:
    case Xgoto.xinsarea:
      await specials();
      break;

    case Xgoto.xcastle:
    case Xgoto.xgilgams:
      await castle();
      break;

    case Xgoto.xboltac:
    case Xgoto.xcant:
    case Xgoto.xchk4win:
    case Xgoto.xcemetry:
    case Xgoto.xedgtown:
      await shops();
      break;

    case Xgoto.xnewmaze:
    case Xgoto.xequip6:
    case Xgoto.xeqpdsp:
    case Xgoto.xreorder:
    case Xgoto.xcmp2eq6:
    case Xgoto.xcampstf:
      await utilitie();
      break;

    case Xgoto.xtrainin:
    case Xgoto.xbck2rol:
      await roller();
      break;

    case Xgoto.xrunner:
      await runner();
      break;

    case Xgoto.xreward:
    case Xgoto.xreward2:
      await rewards();
      break;

    case Xgoto.xcombat:
    case Xgoto.xunused:
      await combat();
      break;

    case Xgoto.xinspect:
    case Xgoto.xinspct2:
    case Xgoto.xinspct3:
    case Xgoto.xbck2cmp:
    case Xgoto.xbk2cmp2:
      await camp();
      break;

    default:
      break;
  }
}


/** The mainline. Runs until the page is closed; there was never a way out. */
export async function wizardry(): Promise<void> {
  for (;;) {
    g.llbase04 = -1;
    await specials();

    do {
      await segment();
    } while (g.xgoto !== Xgoto.xdone);

    write(chr(12));
    gotoxy(0, 10);
    write('    PRESS [RETURN] FOR MORE WIZARDRY    ');

    do {
      await getkey();
    } while (g.inchar !== chr(13));
  }
}
