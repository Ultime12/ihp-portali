function financePdfAscii(value) {
  const map = {
    "ı": "i", "İ": "I", "ğ": "g", "Ğ": "G", "ü": "u", "Ü": "U",
    "ş": "s", "Ş": "S", "ö": "o", "Ö": "O", "ç": "c", "Ç": "C"
  };
  return String(value ?? "")
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => map[char] || char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function financePdfRgb(hex, fallback = "#0b1b31") {
  const value = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : fallback;
  return [1, 3, 5]
    .map((start) => (parseInt(value.slice(start, start + 2), 16) / 255).toFixed(3))
    .join(" ");
}

function financePdfJpegBytes(dataUrl = "") {
  const match = String(dataUrl).match(/^data:image\/jpeg;base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function financePdfJpegSize(bytes) {
  if (!bytes || bytes.length < 4) return { width: 320, height: 320 };
  let index = 2;
  while (index + 8 < bytes.length) {
    if (bytes[index] !== 0xff) break;
    const marker = bytes[index + 1];
    const length = (bytes[index + 2] << 8) + bytes[index + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return {
        height: (bytes[index + 5] << 8) + bytes[index + 6],
        width: (bytes[index + 7] << 8) + bytes[index + 8]
      };
    }
    if (!length) break;
    index += 2 + length;
  }
  return { width: 320, height: 320 };
}

function createPdfBuilder(title, logoUrl, options = {}) {
  const width = 595;
  const height = 842;
  const margin = 42;
  const pages = [];
  const images = [];
  let page;
  let y;

  function addImage(bytes) {
    const name = `Im${images.length + 1}`;
    images.push({ name, bytes, ...financePdfJpegSize(bytes) });
    return name;
  }

  const logoBytes = financePdfJpegBytes(logoUrl);
  const logoName = logoBytes ? addImage(logoBytes) : "";
  const fill = (color) => page.ops.push(`${financePdfRgb(color)} rg`);
  const stroke = (color) => page.ops.push(`${financePdfRgb(color)} RG`);

  function rect(x, rectY, rectWidth, rectHeight, fillColor = null, strokeColor = null) {
    if (fillColor) fill(fillColor);
    if (strokeColor) stroke(strokeColor);
    page.ops.push(`${x} ${rectY} ${rectWidth} ${rectHeight} re ${fillColor && strokeColor ? "B" : fillColor ? "f" : "S"}`);
  }

  function text(x, textY, value, size = 10, font = "F1", color = "#0f172a") {
    fill(color);
    page.ops.push(`BT /${font} ${size} Tf ${x} ${textY} Td (${financePdfAscii(value)}) Tj ET`);
  }

  function image(name, x, imageY, imageWidth, imageHeight) {
    if (name) page.ops.push(`q ${imageWidth} 0 0 ${imageHeight} ${x} ${imageY} cm /${name} Do Q`);
  }

  function header() {
    rect(0, height - 86, width, 86, "#0b1b31");
    rect(0, height - 91, width, 5, "#2563eb");
    if (logoName) {
      image(logoName, margin, height - 72, 42, 42);
    } else {
      rect(margin, height - 72, 42, 42, "#ffffff");
      text(margin + 8, height - 55, "IHP", 13, "F2", "#0b1b31");
    }
    text(margin + 56, height - 48, title, 16, "F2", "#ffffff");
    text(margin + 56, height - 66, options.subtitle || "IHP Finans resmi belgesi", 9, "F1", "#cbd5e1");
    y = height - 118;
  }

  function addPage() {
    page = { ops: [] };
    pages.push(page);
    header();
  }

  function ensureSpace(space) {
    if (y - space < 76) addPage();
  }

  function wrap(value, maxWidth, size = 10) {
    const words = String(value || "Belirtilmedi").split(/\s+/).filter(Boolean);
    const maxChars = Math.max(14, Math.floor(maxWidth / (size * 0.52)));
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ["Belirtilmedi"];
  }

  function section(label) {
    ensureSpace(34);
    rect(margin, y - 20, width - margin * 2, 24, "#e8eefc");
    text(margin + 12, y - 12, label, 11, "F2", "#0b1b31");
    y -= 38;
  }

  function keyValueRows(rows) {
    for (const [key, value] of rows) {
      const valueLines = wrap(value, width - margin * 2 - 204, 8.5);
      const rowHeight = Math.max(24, 12 + valueLines.length * 11);
      ensureSpace(rowHeight);
      const rowY = y - rowHeight + 6;
      rect(margin, rowY, width - margin * 2, rowHeight, "#f8fafc", "#e2e8f0");
      text(margin + 12, rowY + rowHeight - 16, key, 8.5, "F2", "#475569");
      valueLines.forEach((line, index) => {
        text(margin + 190, rowY + rowHeight - 16 - index * 11, line, 8.5, "F1", "#111827");
      });
      y -= rowHeight;
    }
    y -= 12;
  }

  function paragraph(label, value) {
    const lines = wrap(value, width - margin * 2, 9.5);
    ensureSpace(28 + lines.length * 14);
    text(margin, y, label, 10, "F2", "#2563eb");
    y -= 16;
    for (const line of lines) {
      text(margin, y, line, 9.5, "F1", "#1f2937");
      y -= 14;
    }
    y -= 8;
  }

  function finish() {
    pages.forEach((item, index) => {
      page = item;
      rect(0, 0, width, 46, "#f8fafc");
      text(margin, 24, options.footer || "IHP Finans - resmi sistem belgesi.", 8, "F1", "#64748b");
      text(width - margin - 70, 24, `Sayfa ${index + 1}/${pages.length}`, 8, "F1", "#64748b");
    });
    return buildFinancePdf(pages, images, width, height);
  }

  addPage();
  return { section, keyValueRows, paragraph, finish };
}

function buildFinancePdf(pages, images, width, height) {
  const encoder = new TextEncoder();
  const objects = [];
  const addObject = (parts) => {
    objects.push(Array.isArray(parts) ? parts : [String(parts)]);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const imageIds = new Map();

  images.forEach((item) => {
    imageIds.set(item.name, addObject([
      `<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.bytes.length} >>\nstream\n`,
      item.bytes,
      "\nendstream"
    ]));
  });

  const pageIds = pages.map((item) => {
    const stream = item.ops.join("\n");
    const contentId = addObject(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const xObjects = [...imageIds].map(([name, id]) => `/${name} ${id} 0 R`).join(" ");
    const resources = `<< /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> ${xObjects ? `/XObject << ${xObjects} >>` : ""} >>`;
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${resources} /Contents ${contentId} 0 R >>`);
  });
  objects[pagesId - 1] = [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`];

  const chunks = [];
  const offsets = [0];
  let byteLength = 0;
  const append = (part) => {
    const chunk = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(chunk);
    byteLength += chunk.length;
  };
  append("%PDF-1.4\n%IHP\n");
  objects.forEach((parts, index) => {
    offsets.push(byteLength);
    append(`${index + 1} 0 obj\n`);
    parts.forEach(append);
    append("\nendobj\n");
  });
  const xref = byteLength;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => append(`${String(offset).padStart(10, "0")} 00000 n \n`));
  append(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
