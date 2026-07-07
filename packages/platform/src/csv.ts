/**
 * Small RFC-4180-style CSV parser: quoted fields, escaped quotes, CR/LF line
 * endings. No streaming — synagogue exports are at most tens of thousands of
 * rows, which is fine to hold in memory.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnything = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      sawAnything = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      sawAnything = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      if (sawAnything || field !== "") {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
      sawAnything = false;
    } else {
      field += char;
      sawAnything = true;
    }
  }
  if (sawAnything || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Normalize a header to snake_case: "Date Joined" → "date_joined". */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Parse a CSV with a header row into records keyed by normalized headers.
 * Empty cells are omitted so `record[key]` is either a non-empty trimmed
 * string or undefined.
 */
export function csvToRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const [headerRow, ...dataRows] = rows;
  if (headerRow === undefined) {
    return [];
  }
  const headers = headerRow.map(normalizeHeader);
  return dataRows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = cells[index]?.trim();
      if (header !== "" && value !== undefined && value !== "") {
        record[header] = value;
      }
    });
    return record;
  });
}
