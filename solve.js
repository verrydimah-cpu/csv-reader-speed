// A fast drop-in replacement for csv-reader 1.0.0.
//
// run(input) returns exactly csv-reader 1.0.0's answer for {text, header}:
// {columns, rows, errors} under the same broken-row policy —
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a quoted field runs to the next quote that is not doubled ("" inside it is
//     one quote; each CRLF or lone CR inside it is read as LF); what follows its
//     closing quote, up to the next comma or line break, is appended as it stands
//     (quote_junk, when the field ends); a quote that never closes is a literal
//     character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row) or cut (long_row) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside quotes counted), row its record's
//     index in rows, null for the header, in the order met.
//
// Where the reference builds every field a character at a time and returns a
// small object per field, this reader scans with charCodeAt, cuts each field
// out of the text with one slice, and only assembles pieces when a stray CR, a
// doubled quote or a CR inside quotes forces it to. No per-field objects, no
// regular expressions, no dependencies.

const COMMA = 44; // ,
const QUOTE = 34; // "
const LF = 10; // \n
const CR = 13; // \r

// How the last field read ended.
const ENDED_END = 0;
const ENDED_COMMA = 1;
const ENDED_LINE = 2;

export function run(input) {
  const raw = input.text;
  const text = typeof raw === 'string' ? raw : String(raw);
  const header = input.header === true;
  const n = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the field just read ended, and how many characters the last
  // readUnquoted call kept (the quote_junk test needs the second).
  let fieldEnded = ENDED_END;
  let fieldAdded = 0;

  // The next CR and the next LF at or after the last place they were asked
  // about (n + 1: there are none left). Readers only ever move forward, so
  // each is found once and then reused by every field that starts before it:
  // the whole text is scanned for each just once, natively, per run.
  let crNext = -1;
  let lfNext = -1;
  function crFrom(a) {
    if (crNext < a) {
      const r = text.indexOf('\r', a);
      crNext = r < 0 ? n + 1 : r;
    }
    return crNext;
  }
  function lfFrom(a) {
    if (lfNext < a) {
      const r = text.indexOf('\n', a);
      lfNext = r < 0 ? n + 1 : r;
    }
    return lfNext;
  }

  // Reads unquoted characters onto `prefix` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Sets fieldEnded and
  // fieldAdded (the characters kept by this call, the prefix not counted).
  //
  // The fast path probes for the field's end and its first CR with indexOf:
  // no CR in the field means one slice and no assembly. A CR in the field
  // (other than the CR of the closing CRLF) hands it to the general reader
  // below.
  function readUnquoted(prefix) {
    const start = pos;
    const ci = text.indexOf(',', start);
    const lf = lfFrom(start);
    let end = ci < 0 ? lf : lf < ci ? lf : ci;
    if (end > n) end = n;
    const cr = crFrom(start);
    if (cr >= end) {
      fieldAdded = end - start;
      if (end >= n) {
        fieldEnded = ENDED_END;
        pos = n;
      } else if (text.charCodeAt(end) === COMMA) {
        fieldEnded = ENDED_COMMA;
        pos = end + 1;
      } else {
        fieldEnded = ENDED_LINE;
        pos = end + 1;
        line += 1;
      }
      return prefix + text.slice(start, end);
    }
    if (cr === end - 1 && text.charCodeAt(end) === LF) {
      // The only CR in the field is the CR of the closing CRLF.
      fieldAdded = end - 1 - start;
      fieldEnded = ENDED_LINE;
      pos = end + 1;
      line += 1;
      return prefix + text.slice(start, end - 1);
    }
    return readUnquotedGeneral(prefix);
  }

  // The general unquoted reader: a character at a time over the field's own
  // characters, assembling stretches only where a stray CR cuts one.
  function readUnquotedGeneral(prefix) {
    let i = pos;
    let seg = pos; // the start of the stretch not yet copied out
    let parts = null; // stays null while the field is one clean stretch
    let added = 0;
    for (;;) {
      if (i >= n) {
        fieldEnded = ENDED_END;
        fieldAdded = added + (i - seg);
        pos = n;
        if (parts === null) return prefix + text.slice(seg, i);
        parts.push(text.slice(seg, i));
        return parts.join('');
      }
      const c = text.charCodeAt(i);
      if (c === COMMA) {
        fieldEnded = ENDED_COMMA;
        fieldAdded = added + (i - seg);
        pos = i + 1;
        if (parts === null) return prefix + text.slice(seg, i);
        parts.push(text.slice(seg, i));
        return parts.join('');
      }
      if (c === LF) {
        fieldEnded = ENDED_LINE;
        fieldAdded = added + (i - seg);
        pos = i + 1;
        line += 1;
        if (parts === null) return prefix + text.slice(seg, i);
        parts.push(text.slice(seg, i));
        return parts.join('');
      }
      if (c === CR) {
        if (text.charCodeAt(i + 1) === LF) {
          fieldEnded = ENDED_LINE;
          fieldAdded = added + (i - seg);
          pos = i + 2;
          line += 1;
          if (parts === null) return prefix + text.slice(seg, i);
          parts.push(text.slice(seg, i));
          return parts.join('');
        }
        // A stray CR: dropped, and the field is assembled from its stretches.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [prefix];
        parts.push(text.slice(seg, i));
        added += i - seg;
        i += 1;
        seg = i;
        continue;
      }
      i += 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fieldEnded.
  function readQuoted() {
    const open = pos;
    // Find the closing quote: the next quote that is not doubled. indexOf
    // never scans past it, so the search stays inside the field.
    let i = open + 1;
    let close = -1;
    let doubled = false;
    for (;;) {
      const q = text.indexOf('"', i);
      if (q < 0) break;
      if (text.charCodeAt(q + 1) === QUOTE) {
        doubled = true;
        i = q + 2;
        continue;
      }
      close = q;
      break;
    }
    // A CR inside the quotes makes the value need rebuilding.
    const hasCr = close >= 0 && crFrom(open + 1) < close;
    if (close < 0) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted. The scan moved nothing else, so the
      // line count is still the opening quote's line, as the reference has it.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      return readUnquoted('"');
    }
    let value;
    if (!doubled && !hasCr) {
      // The common quoted field: one slice, and count its line breaks.
      value = text.slice(open + 1, close);
      let j = open + 1;
      for (;;) {
        j = text.indexOf('\n', j);
        if (j < 0 || j >= close) break;
        line += 1;
        j += 1;
      }
    } else {
      // Rebuild: "" is one quote, each CRLF or lone CR is one LF (and one
      // more line), each LF is one more line and stays.
      const parts = [];
      let seg = open + 1;
      let k = open + 1;
      while (k < close) {
        const c = text.charCodeAt(k);
        if (c === QUOTE) {
          parts.push(text.slice(seg, k), '"');
          k += 2;
          seg = k;
        } else if (c === CR) {
          parts.push(text.slice(seg, k), '\n');
          line += 1;
          k += text.charCodeAt(k + 1) === LF ? 2 : 1;
          seg = k;
        } else {
          if (c === LF) line += 1;
          k += 1;
        }
      }
      parts.push(text.slice(seg, close));
      value = parts.join('');
    }
    pos = close + 1;
    if (pos >= n) {
      fieldEnded = ENDED_END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === COMMA) {
      pos += 1;
      fieldEnded = ENDED_COMMA;
      return value;
    }
    if (c === LF) {
      pos += 1;
      line += 1;
      fieldEnded = ENDED_LINE;
      return value;
    }
    if (c === CR && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line += 1;
      fieldEnded = ENDED_LINE;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const withJunk = readUnquoted(value);
    if (fieldAdded > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return withJunk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    for (;;) {
      let value;
      if (text.charCodeAt(pos) === QUOTE) {
        lastQuoted = true;
        value = readQuoted();
      } else {
        lastQuoted = false;
        value = readUnquoted('');
      }
      fields.push(value);
      if (fieldEnded !== ENDED_COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
