// How UCSD Pascal on the Apple II laid records out in memory, and therefore on disk.
//
// The game reads its data by copying raw bytes straight into Pascal record variables, so the only
// specification of the file format is the TYPE section of the program. Describing the records here
// the same way they were declared there means the layout is derived rather than guessed, and the
// sizes it computes can be checked against the ones the data itself implies.
//
// The rules, which the sizes in wiz-types.spec.ts confirm against a real disk:
//   - a word is two bytes, little-endian, and every field starts on a word boundary
//   - INTEGER, BOOLEAN and any enumeration each occupy one whole word
//   - STRING[n] is a length byte and n characters, rounded up to a whole number of words
//   - a PACKED ARRAY of small values packs as many as fit in a word and starts a new word rather
//     than splitting one across the boundary; a two-dimensional one starts each row on a word
//   - an ordinary ARRAY is simply its elements end to end
//
// Writing touches only the bits a field actually occupies, never the padding around it. That is
// what Pascal did - assigning a short name over a long one moved the length byte and the
// characters, and left the rest of the field as it was - and it means reading a record and
// writing it straight back leaves the disk byte for byte as it was found.

const BYTES_PER_WORD: number = 2;
const BITS_PER_WORD: number = 16;


export interface ILayout<T> {
  /** Bytes the field occupies, always even. */
  readonly size: number;

  read(bytes: Uint8Array, offset: number): T;

  write(bytes: Uint8Array, offset: number, value: T): void;
}


function toWords(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_WORD) * BYTES_PER_WORD;
}


function readWord(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}


function writeWord(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xFF;
  bytes[offset + 1] = (value >> 8) & 0xFF;
}


/** Pascal's INTEGER: one signed 16-bit word. */
export function integer(): ILayout<number> {
  return {
    size: BYTES_PER_WORD,
    read(bytes: Uint8Array, offset: number): number {
      const value: number = readWord(bytes, offset);

      return (value >= 0x8000) ? (value - 0x10000) : value;
    },
    write: writeWord,
  };
}


/** A whole word read without a sign, for enumerations and for fields used as bit sets. */
export function word(): ILayout<number> {
  return {
    size: BYTES_PER_WORD,
    read: readWord,
    write: writeWord,
  };
}


export function boolean(): ILayout<boolean> {
  return {
    size: BYTES_PER_WORD,
    read(bytes: Uint8Array, offset: number): boolean {
      return readWord(bytes, offset) !== 0;
    },
    write(bytes: Uint8Array, offset: number, value: boolean): void {
      writeWord(bytes, offset, value ? 1 : 0);
    },
  };
}


/** STRING[maximumLength]: a length byte followed by characters, padded out to a word. */
export function string(maximumLength: number): ILayout<string> {
  return {
    size: toWords(maximumLength + 1),
    read(bytes: Uint8Array, offset: number): string {
      // A length byte larger than the field is only possible on a disk the original did not
      // write, since every place it stores a string caps the length first. Reading no further
      // than the field keeps read and write inverse, so a record read and written straight back
      // leaves the disk as it was found.
      const length: number = Math.min(bytes[offset], maximumLength, bytes.length - offset - 1);
      let text: string = '';

      for (let index: number = 1; index <= length; index++) {
        text = text + String.fromCharCode(bytes[offset + index]);
      }

      return text;
    },
    write(bytes: Uint8Array, offset: number, value: string): void {
      const length: number = Math.min(value.length, maximumLength);

      bytes[offset] = length;

      for (let index: number = 0; index < length; index++) {
        bytes[offset + 1 + index] = value.charCodeAt(index) & 0xFF;
      }
    },
  };
}


/** A PACKED ARRAY of `count` values of `bitWidth` bits each. */
export function packedArray(count: number, bitWidth: number): ILayout<number[]> {
  const perWord: number = Math.floor(BITS_PER_WORD / bitWidth);
  const words: number = Math.ceil(count / perWord);
  const mask: number = (1 << bitWidth) - 1;

  function wordOffset(index: number): number {
    return Math.floor(index / perWord) * BYTES_PER_WORD;
  }

  function shift(index: number): number {
    return (index % perWord) * bitWidth;
  }

  return {
    size: words * BYTES_PER_WORD,
    read(bytes: Uint8Array, offset: number): number[] {
      const values: number[] = [];

      for (let index: number = 0; index < count; index++) {
        values.push((readWord(bytes, offset + wordOffset(index)) >> shift(index)) & mask);
      }

      return values;
    },
    write(bytes: Uint8Array, offset: number, values: readonly number[]): void {
      for (let index: number = 0; index < count; index++) {
        const at: number = offset + wordOffset(index);
        const cleared: number = readWord(bytes, at) & ~(mask << shift(index));

        writeWord(bytes, at, cleared | ((values[index] & mask) << shift(index)));
      }
    },
  };
}


/** A PACKED ARRAY of PACKED ARRAYs: each row begins on a word boundary. */
export function packedGrid(rows: number, columns: number, bitWidth: number): ILayout<number[][]> {
  const row: ILayout<number[]> = packedArray(columns, bitWidth);

  return {
    size: row.size * rows,
    read(bytes: Uint8Array, offset: number): number[][] {
      const grid: number[][] = [];

      for (let index: number = 0; index < rows; index++) {
        grid.push(row.read(bytes, offset + (index * row.size)));
      }

      return grid;
    },
    write(bytes: Uint8Array, offset: number, values: readonly (readonly number[])[]): void {
      for (let index: number = 0; index < rows; index++) {
        row.write(bytes, offset + (index * row.size), values[index] as number[]);
      }
    },
  };
}


/** An ordinary ARRAY: elements laid end to end, each already word-aligned. */
export function array<T>(count: number, element: ILayout<T>): ILayout<T[]> {
  return {
    size: element.size * count,
    read(bytes: Uint8Array, offset: number): T[] {
      const values: T[] = [];

      for (let index: number = 0; index < count; index++) {
        values.push(element.read(bytes, offset + (index * element.size)));
      }

      return values;
    },
    write(bytes: Uint8Array, offset: number, values: readonly T[]): void {
      for (let index: number = 0; index < count; index++) {
        element.write(bytes, offset + (index * element.size), values[index]);
      }
    },
  };
}


export interface IWizardryLong {
  low: number;
  mid: number;
  high: number;
}


/**
 * The game's large-number type: three words of four decimal digits each, so gold and experience
 * run to twelve digits. Arithmetic on it is done digit by digit and saturates rather than wrapping,
 * which is why it is kept in this shape rather than converted to a single number.
 */
export function wizardryLong(): ILayout<IWizardryLong> {
  return {
    size: 3 * BYTES_PER_WORD,
    read(bytes: Uint8Array, offset: number): IWizardryLong {
      return {
        low: readWord(bytes, offset),
        mid: readWord(bytes, offset + 2),
        high: readWord(bytes, offset + 4),
      };
    },
    write(bytes: Uint8Array, offset: number, value: IWizardryLong): void {
      writeWord(bytes, offset, value.low);
      writeWord(bytes, offset + 2, value.mid);
      writeWord(bytes, offset + 4, value.high);
    },
  };
}


type Fields = Record<string, ILayout<unknown>>;

type RecordValue<T extends Fields> = { [K in keyof T]: ReturnType<T[K]['read']> };

export interface IRecordLayout<T extends Fields> extends ILayout<RecordValue<T>> {
  /** Byte offset of each field from the start of the record, for pinning a layout in a test. */
  readonly offsets: Readonly<Record<keyof T, number>>;
}


/** A RECORD: its fields in declared order, each starting where the previous one ended. */
export function record<T extends Fields>(fields: T): IRecordLayout<T> {
  const offsets: Record<string, number> = {};
  let size: number = 0;

  for (const [name, field] of Object.entries(fields)) {
    offsets[name] = size;
    size = size + field.size;
  }

  return {
    size,
    offsets: offsets as Readonly<Record<keyof T, number>>,
    read(bytes: Uint8Array, offset: number): RecordValue<T> {
      const value: Record<string, unknown> = {};

      for (const [name, field] of Object.entries(fields)) {
        value[name] = field.read(bytes, offset + offsets[name]);
      }

      return value as RecordValue<T>;
    },
    write(bytes: Uint8Array, offset: number, value: RecordValue<T>): void {
      for (const [name, field] of Object.entries(fields)) {
        // Each field knows its own type; the record only knows where each one starts.
        (field as ILayout<unknown>).write(bytes, offset + offsets[name], (value as Record<string, unknown>)[name]);
      }
    },
  };
}
