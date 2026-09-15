// The shape of one line of SCENARIO.MESGS, shared by the code that reads it and the fixture that
// writes it, so a wrong offset cannot hide by being wrong in both.
//
// A record is 42 bytes: a length byte, up to 38 characters, a pad byte rounding the string to a
// whole number of words, and then a word saying whether this is the message's last line. The game
// copies all 42 into a record whose string is only the first 40 of them, which is how that last
// word gets read at all.

export const MESSAGE_BYTES: number = 42;
export const MESSAGES_PER_BLOCK: number = 12;
export const MESSAGE_TEXT: number = 38;
export const ENDMSG_AT: number = 40;
