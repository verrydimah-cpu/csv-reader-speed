# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/verrydimah-cpu/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/verrydimah-cpu/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0. `solve.js` exports `run(input)`, which returns exactly csv-reader's answer — `{columns, rows, errors}` — for every input, including every broken row: stray CRs dropped outside quotes, junk after a closing quote appended and reported, a quote that never closes read again as unquoted text, CR and CRLF inside quotes read as LF, and ragged rows padded or cut to the first record's width with `short_row` / `long_row` errors in the order met. `main.ts` is the standard driver: it reads the cases from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

Where the reference builds each field a character at a time and returns a small object per field, this reader scans with `charCodeAt`, cuts each field out of the text with a single slice, and assembles pieces only when a stray CR, a doubled quote or a CR inside quotes forces it to. The next CR and the next LF are each located once and then reused by every later field, so the whole text is scanned for them just once, natively, per call. No dependencies, no regular expressions in the reader.

On the kit's practice set (six files of 1.4–2.0 million characters) the reader itself runs about 8× faster than csv-reader 1.0.0, and the full entry about 3.7× faster, with byte-identical answers on every case.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir holding cases.json> MAKEFUN_OUTPUT_DIR=<dir for answers.json> node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=hz6kvzj2&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
