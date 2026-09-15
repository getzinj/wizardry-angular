// EXIT( SOMEPROC), which UCSD Pascal has and TypeScript has not.
//
// EXIT names a procedure and unwinds to just after its call, however many frames deep the code
// currently is. The game leans on it hard - 188 sites - and mostly to leave a procedure other than
// the one running, which is a throw in everything but spelling. So it is one here: EXIT throws a
// token naming its target, and the target's own body catches the token bearing its name.
//
// A Pascal FUNCTION assigns its result and then exits, so the result lives in a variable that
// outlives the unwinding; ported functions therefore keep their result in a local and return it
// after WITHEXIT rather than through it.

export class PascalExit extends Error {
  constructor(public readonly target: string) {
    super(`EXIT(${ target })`);
    this.name = 'PascalExit';
  }
}


/** EXIT( TARGET). Unwinds to the end of TARGET's body. */
export function exit(target: string): never {
  throw new PascalExit(target);
}


function rethrowUnlessTargeted(thrown: unknown, target: string): void {
  if ((thrown instanceof PascalExit) && (thrown.target === target)) {
    return;
  } else {
    throw thrown;
  }
}


/** Wraps the body of a procedure that is the target of an EXIT somewhere inside it. */
export async function withExit(target: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
  } catch (thrown: unknown) {
    rethrowUnlessTargeted(thrown, target);
  }
}


/** As withExit, for a procedure that never waits for a key and so need not be awaited. */
export function withExitSync(target: string, body: () => void): void {
  try {
    body();
  } catch (thrown: unknown) {
    rethrowUnlessTargeted(thrown, target);
  }
}
