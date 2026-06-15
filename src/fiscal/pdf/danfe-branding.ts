import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import sharp from "sharp";
import { getIssuerConfig } from "@/fiscal/config/issuer";

const execFileAsync = promisify(execFile);

const DENSITY = 150;
const EMITTER_BOX_X = 40;
const EMITTER_BOX_Y = 176;
const EMITTER_BOX_WIDTH = 458;
const EMITTER_BOX_HEIGHT = 171;
const LOGO_WIDTH_PX = 104;
const LOGO_X_OFFSET = 16;
const LOGO_Y_OFFSET = 18;
const TEXT_X_OFFSET = 142;
const TEXT_CENTER_X = EMITTER_BOX_X + TEXT_X_OFFSET + (EMITTER_BOX_WIDTH - TEXT_X_OFFSET) / 2;
const TITLE_FONT_SIZE = 22;
const DETAIL_FONT_SIZE = 12;
const LINE_HEIGHT = 28;
const DETAIL_LINE_HEIGHT = 24;

function toLatin1Buffer(value: string) {
  return Buffer.from(value, "latin1");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string, maxChars: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function makePdfFromJpeg(jpeg: Buffer, widthPx: number, heightPx: number, density = DENSITY) {
  const widthPt = (widthPx * 72) / density;
  const heightPt = (heightPx * 72) / density;
  const content = `q\n${widthPt.toFixed(2)} 0 0 ${heightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBuffer = toLatin1Buffer(content);

  const parts: Buffer[] = [toLatin1Buffer("%PDF-1.4\n")];
  const offsets = [0];
  let offset = parts[0].length;
  const addObject = (id: number, body: Buffer) => {
    offsets[id] = offset;
    const prefix = toLatin1Buffer(`${id} 0 obj\n`);
    const suffix = toLatin1Buffer("\nendobj\n");
    parts.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  };

  addObject(1, toLatin1Buffer("<< /Type /Catalog /Pages 2 0 R >>"));
  addObject(2, toLatin1Buffer("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  addObject(
    3,
    toLatin1Buffer(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`
    )
  );
  addObject(4, toLatin1Buffer(`<< /Length ${contentBuffer.length} >>\nstream\n${content}\nendstream`));
  addObject(
    5,
    Buffer.concat([
      toLatin1Buffer(
        `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      toLatin1Buffer("\nendstream"),
    ])
  );

  const body = Buffer.concat(parts);
  const xrefOffset = body.length;
  const xrefEntries = ["0000000000 65535 f \n"];
  for (let i = 1; i <= 5; i++) {
    xrefEntries.push(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }

  const trailer = toLatin1Buffer(
    `xref\n0 ${offsets.length + 1}\n${xrefEntries.join("")}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return Buffer.concat([body, trailer]);
}

async function renderFirstPageWithLogo(sourcePdfPath: string, tempDir: string) {
  const prefix = path.join(tempDir, "first-page");
  await execFileAsync("pdftoppm", ["-r", String(DENSITY), "-f", "1", "-l", "1", "-singlefile", "-png", sourcePdfPath, prefix]);
  const pngPath = `${prefix}.png`;
  const logoPath = path.join(process.cwd(), "public", "k2-logo.jpeg");
  const [pageBuffer, logoBuffer] = await Promise.all([readFile(pngPath), readFile(logoPath)]);

  const pageImage = sharp(pageBuffer);
  const meta = await pageImage.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Nao foi possivel ler dimensoes da DANFE");
  }

  const logoResized = await sharp(logoBuffer)
    .resize({ width: LOGO_WIDTH_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();

  const issuer = getIssuerConfig();
  const issuerNameLines = wrapText(issuer.razaoSocial.toUpperCase(), 25).slice(0, 3);
  const issuerAddressLine = `${issuer.endereco.logradouro}, ${issuer.endereco.numero} - ${issuer.endereco.bairro}`.toUpperCase();
  const issuerCityLine = `${issuer.endereco.municipio} - ${issuer.endereco.uf}`.toUpperCase();
  const issuerCepLine = `CEP: ${issuer.endereco.cep.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3")}`;

  const titleSpans = issuerNameLines
    .map(
      (line, index) =>
        `<tspan x="${TEXT_CENTER_X}" y="${EMITTER_BOX_Y + 48 + index * LINE_HEIGHT}">${escapeXml(line)}</tspan>`
    )
    .join("");

  const detailLines = [issuerAddressLine, issuerCityLine, issuerCepLine];
  const detailSpans = detailLines
    .map(
      (line, index) =>
        `<tspan x="${TEXT_CENTER_X}" y="${EMITTER_BOX_Y + 118 + index * DETAIL_LINE_HEIGHT}">${escapeXml(line)}</tspan>`
    )
    .join("");

  const emitterOverlaySvg = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}">
      <rect x="${EMITTER_BOX_X}" y="${EMITTER_BOX_Y}" width="${EMITTER_BOX_WIDTH}" height="${EMITTER_BOX_HEIGHT}" rx="8" ry="8" fill="#ffffff" stroke="#5f5f5f" stroke-width="1.5"/>
      <image
        href="data:image/jpeg;base64,${logoResized.toString("base64")}"
        x="${EMITTER_BOX_X + LOGO_X_OFFSET}"
        y="${EMITTER_BOX_Y + LOGO_Y_OFFSET}"
        width="${LOGO_WIDTH_PX}"
        height="${LOGO_WIDTH_PX}"
        preserveAspectRatio="xMidYMid meet"
      />
      <text font-family="Arial, Helvetica, sans-serif" font-size="${TITLE_FONT_SIZE}" font-weight="700" fill="#231815" text-anchor="middle">
        ${titleSpans}
      </text>
      <text font-family="Arial, Helvetica, sans-serif" font-size="${DETAIL_FONT_SIZE}" font-weight="700" fill="#231815" text-anchor="middle">
        ${detailSpans}
      </text>
    </svg>`,
    "utf8"
  );

  const composed = await pageImage
    .composite([{ input: emitterOverlaySvg, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();

  const composedMeta = await sharp(composed).metadata();
  if (!composedMeta.width || !composedMeta.height) {
    throw new Error("Nao foi possivel gerar a pagina da DANFE com a logo");
  }

  return makePdfFromJpeg(composed, composedMeta.width, composedMeta.height);
}

export async function brandDanfePdf(sourcePdfPath: string, outputPdfPath: string) {
  const workDir = await mkdtemp(path.join(tmpdir(), "erp-k2-danfe-"));
  try {
    const pagesDir = path.join(workDir, "pages");
    await mkdir(pagesDir, { recursive: true });
    await execFileAsync("pdfseparate", [sourcePdfPath, path.join(pagesDir, "page-%d.pdf")]);
    const pageFiles = (await readdir(pagesDir))
      .filter((file) => file.toLowerCase().endsWith(".pdf"))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    if (pageFiles.length === 0) {
      throw new Error("DANFE sem paginas");
    }

    const firstPagePdf = await renderFirstPageWithLogo(sourcePdfPath, workDir);
    const firstPagePdfPath = path.join(workDir, "page-1-brand.pdf");
    await writeFile(firstPagePdfPath, firstPagePdf);

    if (pageFiles.length === 1) {
      await writeFile(outputPdfPath, firstPagePdf);
      return;
    }

    const finalPages = [firstPagePdfPath, ...pageFiles.slice(1).map((file) => path.join(pagesDir, file))];
    const mergedPath = path.join(workDir, "merged.pdf");
    await execFileAsync("pdfunite", [...finalPages, mergedPath]);
    await writeFile(outputPdfPath, await readFile(mergedPath));
  } finally {
    // Best-effort cleanup.
  }
}
