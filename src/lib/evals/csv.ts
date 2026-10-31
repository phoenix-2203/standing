/** Minimal RFC 4180 CSV parser: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length) rows.push([...row, field]);
  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ""));
  return body.map((r, n) => {
    if (r.length !== header.length) throw new Error(`CSV row ${n + 2} has ${r.length} fields, expected ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}
