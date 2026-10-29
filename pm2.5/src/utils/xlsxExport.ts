/**
 * Minimal, dependency-free XLSX (Excel workbook) writer.
 *
 * Why not the `xlsx` npm package? The last npm release carries known security
 * advisories, and `exceljs` is very heavy for a single export feature. XLSX is
 * just a ZIP of XML parts, so we can write a small, well-understood subset
 * ourselves: stored (uncompressed) ZIP entries + OOXML worksheet/workbook
 * parts. The output opens in Excel, Google Sheets, and LibreOffice.
 */

export type XlsxCell = string | number | { v: string | number; s?: number };

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
}

// ── CRC-32 (IEEE 802.3, as used by ZIP) ──────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── Small binary helpers ─────────────────────────────────────────────────────

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
}

function encodeText(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Build a ZIP archive using STORED (uncompressed) entries. */
function zipStored(entries: ZipEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const dos = dosDateTime(new Date());
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeText(entry.name);
    const size = entry.data.length;
    const crc = crc32(entry.data);

    // Local file header
    localParts.push(
      concatBytes(
        u32(0x04034b50),
        u16(20), // version needed to extract
        u16(0), // general purpose flags
        u16(0), // compression method: stored
        u16(dos.time),
        u16(dos.date),
        u32(crc),
        u32(size), // compressed size
        u32(size), // uncompressed size
        u16(nameBytes.length),
        u16(0), // extra field length
        nameBytes,
        entry.data,
      ),
    );

    // Central directory entry
    centralParts.push(
      concatBytes(
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed to extract
        u16(0), // flags
        u16(0), // method: stored
        u16(dos.time),
        u16(dos.date),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0), // extra field length
        u16(0), // comment length
        u16(0), // disk number start
        u16(0), // internal attributes
        u32(0), // external attributes
        u32(offset),
        nameBytes,
      ),
    );
    offset += localParts[localParts.length - 1].length;
  }

  const centralSize = centralParts.reduce((n, c) => n + c.length, 0);
  const end = concatBytes(
    u32(0x06054b50),
    u16(0), // disk number
    u16(0), // disk with central directory
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0), // comment length
  );

  return new Blob([concatBytes(...localParts, ...centralParts, end)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── OOXML parts ──────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(i: number): string {
  let s = '';
  let n = i + 1; // 1-based column number
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows: XlsxCell[][]): string {
  const body: string[] = [];
  rows.forEach((row, ri) => {
    const r = ri + 1;
    const cells = row
      .map((cell, ci) => {
        const ref = `${colName(ci)}${r}`;
        if (typeof cell === 'number') {
          return `<c r="${ref}"><v>${Number.isFinite(cell) ? cell : 0}</v></c>`;
        }
        if (typeof cell === 'object') {
          const style = cell.s != null ? ` s="${cell.s}"` : '';
          if (typeof cell.v === 'number') {
            return `<c r="${ref}"${style}><v>${Number.isFinite(cell.v) ? cell.v : 0}</v></c>`;
          }
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.v)}</t></is></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
      })
      .join('');
    body.push(`<row r="${r}">${cells}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body.join('')}</sheetData></worksheet>`;
}

function workbookXml(sheets: XlsxSheet[]): string {
  const sheetTags = sheets
    .map(
      (s, i) =>
        `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`;
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${overrides}
</Types>`;
}

function workbookRelsXml(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

/**
 * Cell styles referenced by index in `XlsxCell.s`:
 * Cell styles referenced by index in `XlsxCell.s`:
 *   0 = normal, 1 = bold, 2 = bold white on dark fill (session headers),
 *   3 = bold on light amber fill (outlier/highlight rows).
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

/** Assemble a workbook (one worksheet per XlsxSheet) into a downloadable Blob. */
export function buildXlsxBlob(sheets: XlsxSheet[]): Blob {
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: encodeText(contentTypesXml(sheets.length)),
    },
    { name: '_rels/.rels', data: encodeText(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: encodeText(workbookXml(sheets)) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encodeText(workbookRelsXml(sheets.length)),
    },
    { name: 'xl/styles.xml', data: encodeText(STYLES_XML) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encodeText(sheetXml(s.rows)),
    })),
  ];
  return zipStored(entries);
}
