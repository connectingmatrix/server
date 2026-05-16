const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 50;
const TOP = 748;
const LINE_HEIGHT = 13;
const MAX_LINES = 52;
const MAX_CHARS = 88;

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(line: string): string[] {
  const clean = line.replace(/\t/g, '  ');
  if (clean.length <= MAX_CHARS) return [clean];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > MAX_CHARS && current) {
      lines.push(current);
      current = word;
      continue;
    }
    current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function readLines(markdown: string): string[] {
  const lines: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const normalized = rawLine
      .replace(/^#{1,6}\s+/, '')
      .replace(/[`*_>#-]/g, '')
      .trimEnd();
    lines.push(...wrapLine(normalized));
  }
  return lines.length ? lines : ['Getting Started'];
}

function object(id: number, body: string): string {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

export function renderGettingStartedPdf(markdown: string): Buffer {
  const pages: string[][] = [];
  const lines = readLines(markdown);
  for (let index = 0; index < lines.length; index += MAX_LINES) {
    pages.push(lines.slice(index, index + MAX_LINES));
  }

  const objects: string[] = [];
  objects.push(object(1, '<< /Type /Catalog /Pages 2 0 R >>'));
  const pageIds = pages.map((_, index) => 3 + index * 2);
  objects.push(object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  pages.forEach((pageLines, index) => {
    const pageId = 3 + index * 2;
    const streamId = pageId + 1;
    const text = pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`).join('\n');
    const stream = `BT /F1 10 Tf ${LINE_HEIGHT} TL ${LEFT} ${TOP} Td\n${text}\nET`;
    objects.push(
      object(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${
          3 + pages.length * 2
        } 0 R >> >> /Contents ${streamId} 0 R >>`,
      ),
    );
    objects.push(object(streamId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
  });
  objects.push(object(3 + pages.length * 2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const entry of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += entry;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}
