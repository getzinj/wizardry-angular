// The game's random numbers.
//
// This is not the Pascal library's generator. The game links a short machine-code routine of its
// own: four bytes of state, shifted left seven times per call with a feedback bit folded back in,
// returning fifteen bits. It is reproduced rather than replaced because the game leans on its
// exact behaviour in places, and because a seedable generator makes fights reproducible in tests.
//
// On the real machine nothing seeded it. Instead, while waiting for a keypress the state was
// stirred in a tight loop, so the numbers depended on how long the player took to press a key.
// That is what `stir` stands in for.

const STATE_BYTES: number = 4;
const SHIFTS_PER_CALL: number = 7;

/** Largest value returned: the result is fifteen bits. */
export const RANDOM_MAXIMUM: number = 32767;


export class Random {
  private readonly state: Uint8Array = new Uint8Array(STATE_BYTES);


  constructor(seed: number = 1) {
    this.seed(seed);
  }


  public seed(seed: number): void {
    for (let index: number = 0; index < STATE_BYTES; index++) {
      this.state[index] = (seed >>> (index * 8)) & 0xFF;
    }

    if (this.state.every((byte: number): boolean => byte === 0)) {
      this.state[0] = 1;
    }
  }


  /** A number from 0 to 32767, as the original's RANDOM returns. */
  public next(): number {
    for (let shift: number = 0; shift < SHIFTS_PER_CALL; shift++) {
      this.shiftOnce();
    }

    return ((this.state[0] >> 1) << 8) | this.state[2];
  }


  /** The `RANDOM MOD n` the game writes everywhere. */
  public modulo(limit: number): number {
    return this.next() % limit;
  }


  /**
   * Advances the state as the wait for a keypress did, so how long the player takes still
   * perturbs the sequence.
   *
   * Only the first byte moves. The routine that did this stepped a carry through the three
   * addresses following the first, but the generator's other three bytes are not there: they sit
   * much further apart in memory, and the carry landed in bytes nothing ever read. The original
   * listing marks this as a bug. It is reproduced rather than corrected, because correcting it
   * would change every number the game goes on to draw.
   */
  public stir(steps: number): void {
    this.state[0] = (this.state[0] + steps) & 0xFF;
  }


  private shiftOnce(): void {
    let carry: number = 0;

    for (let index: number = 0; index < STATE_BYTES; index++) {
      const shifted: number = (this.state[index] << 1) | carry;

      carry = (shifted >> 8) & 1;
      this.state[index] = shifted & 0xFF;
    }

    // The feedback bit: the top bits of the first and last bytes disagreeing is what keeps the
    // sequence from collapsing. Both are read AFTER the shift. That detail decides the whole
    // sequence, and it is easy to get wrong: the original saves the processor flags immediately
    // after shifting the first byte, so what it later tests is the shifted byte's top bit, not
    // the bit that was shifted out of it.
    if (((this.state[0] & 0x80) !== 0) !== ((this.state[STATE_BYTES - 1] & 0x80) !== 0)) {
      this.state[0] = (this.state[0] + 1) & 0xFF;
    }
  }

}
