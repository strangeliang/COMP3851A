import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import studyLimits from "../../shared/studyLimits.json";

export const SUPPORTED_MATERIAL_EXTENSIONS = ["txt", "md", "pdf", "docx", "pptx", "png", "jpg", "jpeg", "webp", "bmp"];
export const MAX_STORED_TEXT_CHARACTERS = studyLimits.maxStoredTextCharacters;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);
const OFFICE_TEXT_ENTRY_PATTERN = { docx: /^word\/document\.xml$/i, pptx: /^ppt\/slides\/slide\d+\.xml$/i };

export function getFileExtension(fileName = "") {
  const name = String(fileName);
  return name.includes(".") ? name.split(".").pop().trim().toLowerCase() : "";
}

export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    const value = bytes / 1024 / 1024;
    return `${Number(value).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function cleanExtractedText(value) {
  return String(value || "").split("\u0000").join("").replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function abortError() { return new DOMException("The file reading operation was cancelled.", "AbortError"); }
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

async function abortable(promise, signal, onAbort = null) {
  checkAbort(signal);
  if (!signal) return promise;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const handler = () => { onAbort?.(); rejectAbort(abortError()); };
  signal.addEventListener("abort", handler, { once: true });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", handler); }
}

function parseOfficeXmlText(xml) {
  if (typeof DOMParser === "undefined") return cleanExtractedText(xml.replace(/<[^>]+>/g, " "));
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.getElementsByTagName("parsererror")[0]) return "";
  const paragraphs = Array.from(parsed.getElementsByTagName("*")).filter((node) => node.localName === "p")
    .map((paragraph) => Array.from(paragraph.getElementsByTagName("*")).filter((node) => node.localName === "t")
      .map((node) => node.textContent || "").join("").trim()).filter(Boolean);
  if (paragraphs.length) return cleanExtractedText(paragraphs.join("\n"));
  return cleanExtractedText(Array.from(parsed.getElementsByTagName("*")).filter((node) => node.localName === "t")
    .map((node) => node.textContent || "").join(" "));
}

function ensureRange(view, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error(`This Office file has an invalid ${label}.`);
  }
}

function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("This Office file could not be opened as a ZIP package.");
}

async function inflateRaw(bytes, expectedSize, signal) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress DOCX or PPTX files.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal, () => { reader.cancel().catch(() => {}); });
      if (done) break;
      length += value.byteLength;
      if (length > expectedSize || length > studyLimits.maxOfficeExpandedBytes) throw new Error("This Office file expands beyond its safe reading limit.");
      chunks.push(value);
    }
    if (length !== expectedSize) throw new Error("This Office file contains an invalid compressed entry.");
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } finally { await reader.cancel().catch(() => {}); }
}

async function readZipTextEntries(arrayBuffer, shouldRead, signal) {
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder("utf-8");
  const end = findEndOfCentralDirectory(view);
  ensureRange(view, end, 22, "central directory footer");
  const count = view.getUint16(end + 10, true);
  if (count > 2000) throw new Error("This Office file contains too many package entries.");
  let offset = view.getUint32(end + 16, true);
  let expandedBytes = 0;
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    checkAbort(signal);
    ensureRange(view, offset, 46, "central directory entry");
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("This Office file central directory is not readable.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    ensureRange(view, offset + 46, nameLength + extraLength + commentLength, "central directory metadata");
    const name = decoder.decode(new Uint8Array(arrayBuffer, offset + 46, nameLength));
    expandedBytes += uncompressedSize;
    if (expandedBytes > studyLimits.maxOfficeExpandedBytes) throw new Error("This Office file expands beyond 20 MB. Remove large embedded media or split the document.");
    if (shouldRead(name)) selected.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const result = [];
  for (const entry of selected) {
    checkAbort(signal);
    ensureRange(view, entry.localOffset, 30, "local entry header");
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error("This Office file local entry is not readable.");
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
    ensureRange(view, dataOffset, entry.compressedSize, "compressed entry data");
    const compressed = new Uint8Array(arrayBuffer, dataOffset, entry.compressedSize);
    let bytes;
    if (entry.method === 0) {
      if (compressed.byteLength !== entry.uncompressedSize) throw new Error("This Office file contains an invalid stored entry.");
      bytes = compressed;
    } else if (entry.method === 8) bytes = await inflateRaw(compressed, entry.uncompressedSize, signal);
    else throw new Error("This Office file uses an unsupported ZIP compression method.");
    result.push({ name: entry.name, text: decoder.decode(bytes) });
  }
  return result;
}

async function extractOfficeText(file, extension, signal) {
  const buffer = await abortable(file.arrayBuffer(), signal);
  const pattern = OFFICE_TEXT_ENTRY_PATTERN[extension];
  const entries = await readZipTextEntries(buffer, (name) => pattern.test(name), signal);
  if (!entries.length) throw new Error(`${file.name} does not contain readable ${extension.toUpperCase()} text.`);
  entries.sort((a, b) => Number(a.name.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.name.match(/slide(\d+)\.xml/i)?.[1] || 0));
  const parts = entries.map((entry, index) => {
    const text = parseOfficeXmlText(entry.text);
    return text ? `${extension === "pptx" ? `Slide ${Number(entry.name.match(/slide(\d+)/i)?.[1] || index + 1)}` : "Document"}\n${text}` : "";
  }).filter(Boolean);
  const text = cleanExtractedText(parts.join("\n\n"));
  if (!text) throw new Error(`${file.name} was opened, but no readable text was found.`);
  return { text, warning: extension === "pptx" ? "Text was extracted from slides; diagrams, charts, equations, and speaker notes may need manual checking." : "Images, equations, and complex document layout may need manual checking." };
}

async function createOcrWorker(onProgress, signal) {
  const { createWorker } = await import("tesseract.js");
  checkAbort(signal);
  const pending = createWorker(["eng", "chi_sim"], 1, { logger: (message) => {
    if (message.status && Number.isFinite(message.progress)) onProgress?.(`${message.status} ${Math.round(message.progress * 100)}%`);
  } }).then(async (worker) => {
    if (signal?.aborted) { await worker.terminate(); throw abortError(); }
    return worker;
  });
  return abortable(pending, signal);
}

async function recognizeImage(blob, label, worker, signal, allowEmpty = false) {
  checkAbort(signal);
  const result = await abortable(worker.recognize(blob), signal, () => { worker.terminate().catch(() => {}); });
  const text = cleanExtractedText(result.data?.text);
  if (!text && !allowEmpty) throw new Error(`${label} was processed with OCR, but no readable English or Simplified Chinese text was found.`);
  return text;
}

async function validateImagePixels(blob, signal) {
  if (typeof createImageBitmap !== "function") return;
  const bitmap = await abortable(createImageBitmap(blob), signal);
  try {
    if (bitmap.width * bitmap.height > studyLimits.maxImagePixels) throw new Error("This image exceeds 20 million pixels. Resize it and upload again.");
  } finally { bitmap.close(); }
}

async function renderPdfPage(page, signal) {
  const viewport = page.getViewport({ scale: 1.6 });
  if (Math.ceil(viewport.width) * Math.ceil(viewport.height) > studyLimits.maxImagePixels) throw new Error("A PDF page is too large to process safely with OCR.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not create an OCR canvas.");
  const task = page.render({ canvasContext: context, viewport });
  await abortable(task.promise, signal, () => task.cancel());
  return abortable(new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render a PDF page for OCR.")), "image/png")), signal);
}

async function extractPdfText(file, signal, onProgress) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await abortable(file.arrayBuffer(), signal));
  const loading = pdfjs.getDocument({ data });
  const pdf = await abortable(loading.promise, signal, () => loading.destroy());
  if (pdf.numPages > studyLimits.maxPDFPages) {
    await pdf.destroy();
    throw new Error(`This PDF has ${pdf.numPages} pages. Split it into files of no more than ${studyLimits.maxPDFPages} pages.`);
  }
  const pages = [];
  const pagesForOcr = [];
  let worker = null;
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      checkAbort(signal);
      onProgress?.(`reading PDF page ${number} of ${pdf.numPages}`);
      const page = await abortable(pdf.getPage(number), signal);
      const content = await abortable(page.getTextContent(), signal);
      const direct = cleanExtractedText(content.items.map((item) => item.str || "").join(" "));
      if (direct.length >= 20) pages.push(`Page ${number}\n${direct}`);
      else pagesForOcr.push({ number, page, direct });
    }
    if (pagesForOcr.length > studyLimits.maxPDFOCRPages) throw new Error(`This PDF needs OCR on ${pagesForOcr.length} pages. Split it so each file needs OCR on no more than ${studyLimits.maxPDFOCRPages} pages.`);
    if (pagesForOcr.length) worker = await createOcrWorker(onProgress, signal);
    const unreadablePages = [];
    for (const item of pagesForOcr) {
      checkAbort(signal);
      onProgress?.(`OCR page ${item.number} of ${pdf.numPages}`);
      const blob = await renderPdfPage(item.page, signal);
      const ocr = await recognizeImage(blob, `${file.name} page ${item.number}`, worker, signal, true);
      const combined = cleanExtractedText([item.direct, ocr].filter(Boolean).join(" "));
      if (combined) pages.push(`Page ${item.number}\n${combined}`);
      else unreadablePages.push(item.number);
    }
    pages.sort((a, b) => Number(a.match(/^Page (\d+)/)?.[1]) - Number(b.match(/^Page (\d+)/)?.[1]));
    const text = cleanExtractedText(pages.join("\n\n"));
    if (!text) throw new Error("This PDF does not contain readable text, and OCR could not find English or Simplified Chinese text.");
    const warning = pagesForOcr.length ? `OCR was used on ${pagesForOcr.length} page(s). Check names, formulas, tables, and diagrams against the original.` : "PDF text was extracted directly. Check formulas, tables, and diagrams against the original.";
    return { text, warning: `${warning}${unreadablePages.length ? ` No text was detected on page(s) ${unreadablePages.join(", ")}; verify that these pages are blank.` : ""}` };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    await pdf.destroy().catch(() => {});
  }
}

async function extractImageText(file, signal, onProgress) {
  await validateImagePixels(file, signal);
  const worker = await createOcrWorker(onProgress, signal);
  try {
    const text = await recognizeImage(file, file.name, worker, signal);
    return { text, warning: "OCR was used. Check names, formulas, tables, and diagrams against the original image." };
  } finally { await worker.terminate().catch(() => {}); }
}

async function extract(file, { signal, onProgress }) {
  const extension = getFileExtension(file.name);
  if (!SUPPORTED_MATERIAL_EXTENSIONS.includes(extension)) throw new Error("Unsupported file type. Use TXT, MD, PDF, DOCX, PPTX, PNG, JPG, JPEG, WEBP, or BMP.");
  checkAbort(signal);
  onProgress?.("opening file");
  if (extension === "txt" || extension === "md") {
    const text = cleanExtractedText(await abortable(file.text(), signal));
    if (!text) throw new Error(`${file.name} is empty or does not contain readable text.`);
    return { text, warning: "" };
  }
  if (extension === "docx" || extension === "pptx") return extractOfficeText(file, extension, signal);
  if (extension === "pdf") return extractPdfText(file, signal, onProgress);
  if (IMAGE_EXTENSIONS.has(extension)) return extractImageText(file, signal, onProgress);
  throw new Error("Unsupported file type.");
}

export async function extractTextFromFile(file, options = {}) {
  const controller = new AbortController();
  const external = options.signal;
  const forwardAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), studyLimits.uploadTimeoutMilliseconds);
  try {
    checkAbort(controller.signal);
    return await abortable(extract(file, { signal: controller.signal, onProgress: options.onProgress }), controller.signal);
  } catch (error) {
    if (controller.signal.aborted && !external?.aborted) throw new Error("File reading took longer than 3 minutes. Split the file or try a smaller version.");
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forwardAbort);
  }
}
