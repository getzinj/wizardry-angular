// The passing of time, as the game's empty delay loops saw it.
//
// The original paced itself by counting to a number and doing nothing. Here that is a wait on the
// clock, and the clock is a part of the machine so that a test can put an instant one in its place,
// the way one puts a scripted keyboard in.

export interface IClock {
  sleep(milliseconds: number): Promise<void>;
}


export class Clock implements IClock {

  public sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, milliseconds);
    });
  }

}


/** Never waits: remembers what it was asked for and returns at once. For tests. */
export class InstantClock implements IClock {
  /** Every sleep asked for, in milliseconds, in order. */
  public readonly requested: number[] = [];


  public sleep(milliseconds: number): Promise<void> {
    this.requested.push(milliseconds);

    return Promise.resolve();
  }

}
