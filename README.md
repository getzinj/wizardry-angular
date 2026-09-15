# Wizardry

The original Apple II *Wizardry: Proving Grounds of the Mad Overlord*, running in a browser.

The approach is to hand-port the game's UCSD Pascal onto a small reimplementation of the runtime
it used, rather than to rewrite the game.

> **Unofficial fan project.** This is a hobby port, not affiliated with or endorsed by whoever
> currently holds the rights to *Wizardry*. No original game data, text, or assets are included or
> distributed here — see "You need your own scenario disk" below. If a rights holder asks for this
> to come down, that's fine; it'll come down without argument.

## You need your own scenario disk

This app does not include or distribute the game. On first load it asks for the **scenario disk**
image — you supply your own dump of the original Apple II disk (`.dsk`, `.po`, `.do`, or `.image`),
the same way a hardware emulator expects you to bring your own disk.

- Hand it over by drag-and-drop or the file picker. It's checked on the spot: handing over the
  *boot* disk instead of the *scenario* disk by mistake is the most common way this goes wrong, and
  a rejection explains what to do about it.
- Nothing is uploaded anywhere. The disk image is read and kept entirely in your browser, never
  sent to a server.
- The original game had no save files — characters lived on the scenario disk itself, which it
  wrote to as you played, so players kept a pristine master and played on copies. This app keeps
  that shape: from your imported master you create up to a handful of **save disks**, pick one to
  play, rename or discard it, and can export a save disk back out as a real, ordinary Apple Pascal
  disk image (re-importable here, or in a real emulator) or import one you exported earlier.
- Until a disk is attached, the app still runs and its tests still pass — it falls back to a
  built-in font (see "Game data" below).

## Layout

| Folder | What lives there |
| --- | --- |
| `src/app/runtime/` | The Apple II and UCSD Pascal emulation: video memory, glyphs, colour, the keyboard, the random generator, the clock the game's delay loops wait on, and the block device. Knows nothing about the game. |
| `src/app/data/` | Disk formats: the record layouts, the disk-image reader, and persistence. Plain TypeScript, so the extractor can run it under Node. |
| `src/app/port/` | The ported game, one file per original Pascal file. |
| `src/app/ui/` | The Angular shell: the canvas, and the host that wires a runtime together. |

## Conventions for `src/app/port/`

- **One file per Pascal source file**, named after it, and each procedure carries a comment naming
  its origin, such as `// RUNNER.TEXT.txt:16 DRAWMAZE`.
- **Original identifiers, lowercased.** Pascal does not distinguish case and TypeScript does, so
  each name gets one spelling. The compiler of the day looked at only the first eight characters,
  which is why some names appear in the source in two lengths; the eight-character form wins.
- **Every procedure is `async`.** Waiting for a keypress, waiting out one of the game's delay
  loops and waiting for the disk are the only things that suspend, but any can happen anywhere,
  so the whole layer is asynchronous and `no-floating-promises` stays on.
- **The disk is reached through `port/diskio.ts`** (`getrec`, `putrec`, `getblock`, ...), never
  `disk()` directly. The scenario is whole in memory, but `ScenarioDisk.drive` keeps the
  original's block-pair cache bookkeeping to say when the drive would have moved, and each
  accessor waits that time out on the machine's clock. That is what puts the pauses back where
  the Apple II had them.
- **Non-local exits** become a thrown `PascalExit` caught at the procedure named, since Pascal
  could jump out of any depth of nesting at once.
- Copy protection is not ported. Where the game called into it, the call throws instead.

## Game data

The game's own data is not in this repository and must not be committed. The disk images, and
anything extracted from them, are ignored by git. Until a disk is attached the runtime falls back
to a font drawn for this project, so the tests and CI never need game data.

## Save disks

The game had no save files. Characters lived on the scenario disk, which it wrote to as you
played, and players kept a master untouched and played on copies. That shape is kept: the disk you
import becomes the master, and you play on copies of it, up to six.

A save disk can be exported, and what comes out is a real Apple Pascal disk image rather than a
format of our own. The same reader that accepts your original disk accepts an exported one, so
importing a save disk needs no separate path, and an emulator can read it too.

## Running it

```
npm install

npm start          # serve at http://localhost:4200
npm test           # run the tests once
npm run test:watch # run the tests in watch mode
npm run build      # production build, output in dist/wizardry
```

The `inspect-dsk` script runs the same checks the app runs when you hand it a disk, from the
command line, without opening a browser:

```
npm run inspect-dsk -- --dsk <path to disk image>
```

## License

Licensed under the [GNU General Public License v3.0](./LICENSE) or later. This covers the
runtime, disk-format handling, and Angular UI in this repository; it does not and cannot grant
rights to the underlying *Wizardry* game itself, which remains the property of its rights holder.
Bring your own legally-owned copy of the game to use this app.
