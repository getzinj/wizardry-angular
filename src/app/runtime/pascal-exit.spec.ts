import { describe, expect, it } from 'vitest';

import { exit, PascalExit, withExit, withExitSync } from './pascal-exit';


describe('exiting the procedure that is running', (): void => {
  it('skips the rest of the body', async (): Promise<void> => {
    const reached: string[] = [];

    await withExit('OUTER', (): void => {
      reached.push('before');
      exit('OUTER');
      reached.push('after');
    });

    expect(reached).toEqual([ 'before' ]);
  });

  it('carries on after the procedure returns', async (): Promise<void> => {
    const reached: string[] = [];

    await withExit('OUTER', (): void => {
      exit('OUTER');
    });
    reached.push('afterwards');

    expect(reached).toEqual([ 'afterwards' ]);
  });
});


describe('exiting a procedure further out', (): void => {
  function inner(): void {
    exit('OUTER');
  }

  it('unwinds past the procedures in between', async (): Promise<void> => {
    const reached: string[] = [];

    await withExit('OUTER', async (): Promise<void> => {
      await withExit('MIDDLE', (): void => {
        inner();
        reached.push('rest of middle');
      });
      reached.push('rest of outer');
    });

    expect(reached).toEqual([]);
  });

  it('leaves an exit aimed elsewhere alone', async (): Promise<void> => {
    await expect(withExit('MIDDLE', (): void => {
      exit('OUTER');
    })).rejects.toBeInstanceOf(PascalExit);
  });
});


describe('an ordinary error thrown inside a procedure', (): void => {
  it('is not swallowed by the exit handler', async (): Promise<void> => {
    await expect(withExit('OUTER', (): void => {
      throw new Error('something else');
    })).rejects.toThrow('something else');
  });
});


describe('exiting a procedure that never waits', (): void => {
  it('skips the rest of the body', (): void => {
    const reached: string[] = [];

    withExitSync('OUTER', (): void => {
      exit('OUTER');
      reached.push('after');
    });

    expect(reached).toEqual([]);
  });

  it('leaves an exit aimed elsewhere alone', (): void => {
    expect((): void => withExitSync('MIDDLE', (): void => exit('OUTER'))).toThrow(PascalExit);
  });
});
