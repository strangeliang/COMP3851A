import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export const SUPPORTED_MATERIAL_EXTENSIONS = [
  "txt",
  "md",
  "pdf",
  "docx",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
];

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp"];
const OFFICE_TEXT_ENTRY_PATTERN = {
  docx: /^word\/document\.xml$/i,
  pptx: /^ppt\/slides\/slide\d+\.xml$/i,
};
const MAX_PDF_OCR_PAGES = 8;
export const MAX_STORED_TEXT_CHARACTERS = 100_000;

export function getFileExtension(fileName = "") {
  return fileName.split(".").pop()?.trim().toLowerCase() || "";
}

export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    const value = bytes / 1024 / 1024;
    return `${Number(value).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function cleanExtractedText(text) {
  return text
    .split("\u0000")
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseOfficeXmlText(xml) {
  if (typeof DOMParser === "undefined") {
    return cleanExtractedText(xml.replace(/<[^>]+>/g, " "));
  }

  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = documentXml.getElementsByTagName("parsererror")[0];
  if (parserError) return "";

  const paragraphElements = Array.from(documentXml.getElementsByTagName("*")).filter(
    (element) => element.localName === "p",
  );

  const paragraphs = paragraphElements
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagName("*"))
        .filter((element) => element.localName === "t")
        .map((element) => element.textContent || "")
        .join(""),
    )
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length) {
    return cleanExtractedText(paragraphs.join("\n"));
  }

  return cleanExtractedText(
    Array.from(documentXml.getElementsByTagName("*"))
      .filter((element) => element.localName === "t")
      .map((element) => element.textContent || "")
      .join(" "),
  );
}

function findEndOfCentralDirectory(view) {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("This Office file could not be opened as a ZIP package.");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress DOCX or PPTX files.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipTextEntries(arrayBuffer, shouldReadEntry) {
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder("utf-8");
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw new Error("This Office file central directory is not readable.");
    }

    const compressionMethod = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localHeaderOffset = view.getUint32(centralOffset + 42, true);
    const fileName = decoder.decode(new Uint8Array(arrayBuffer, centralOffset + 46, fileNameLength));

    if (shouldReadEntry(fileName)) {
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error("This Office file local entry is not readable.");
      }

      const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedBytes = new Uint8Array(arrayBuffer, dataOffset, compressedSize);
      let uncompressedBytes;

      if (compressionMethod === 0) {
        uncompressedBytes = compressedBytes;
      } else if (compressionMethod === 8) {
        uncompressedBytes = await inflateRaw(compressedBytes);
      } else {
        throw new Error("This Office file uses an unsupported ZIP compression method.");
      }

      entries.push({ name: fileName, text: decoder.decode(uncompressedBytes) });
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function extractOfficeText(file, extension) {
  const arrayBuffer = await file.arrayBuffer();
  const pattern = OFFICE_TEXT_ENTRY_PATTERN[extension];
  const entries = await readZipTextEntries(arrayBuffer, (entryName) => pattern.test(entryName));

  if (!entries.length) {
    throw new Error(`${file.name} does not contain readable ${extension.toUpperCase()} text.`);
  }

  const sortedEntries = entries.sort((a, b) => {
    const aNumber = Number(a.name.match(/slide(\d+)\.xml/i)?.[1] || 0);
    const bNumber = Number(b.name.match(/slide(\d+)\.xml/i)?.[1] || 0);
    return aNumber - bNumber;
  });

  const text = cleanExtractedText(sortedEntries.map((entry) => parseOfficeXmlText(entry.text)).join("\n\n"));
  if (!text) {
    throw new Error(`${file.name} was opened, but no readable text was found.`);
  }

  return { text, warning: "" };
}

async function createEnglishOcrWorker() {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng");
}

async function recognizeImage(blob, label = "image", existingWorker = null) {
  const worker = existingWorker || (await createEnglishOcrWorker());

  try {
    const result = await worker.recognize(blob);
    const text = cleanExtractedText(result.data?.text || "");

    if (!text) {
      throw new Error(`${label} was processed with OCR, but no readable text was found.`);
    }

    return text;
  } finally {
    if (!existingWorker) {
      await worker.terminate();
    }
  }
}

async function renderPdfPageToBlob(page, scale = 1.6) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });

  await page.render({ canvasContext: context, viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render the PDF page for OCR."));
    }, "image/png");
  });
}

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = cleanExtractedText(textContent.items.map((item) => item.str || "").join(" "));
    if (pageText) pageTexts.push(pageText);
  }

  const directText = cleanExtractedText(pageTexts.join("\n\n"));
  if (directText.length >= 20) {
    return { text: directText, warning: "" };
  }

  const ocrTexts = [];
  const pagesToRead = Math.min(pdf.numPages, MAX_PDF_OCR_PAGES);
  const worker = await createEnglishOcrWorker();
  try {
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const pageBlob = await renderPdfPageToBlob(page);
      const pageText = await recognizeImage(
        pageBlob,
        `${file.name} page ${pageNumber}`,
        worker,
      );
      ocrTexts.push(`Page ${pageNumber}\n${pageText}`);
    }
  } finally {
    await worker.terminate();
  }

  const ocrText = cleanExtractedText(ocrTexts.join("\n\n"));
  if (!ocrText) {
    throw new Error("This PDF does not expose readable text and OCR could not find text.");
  }

  const warning =
    pdf.numPages > MAX_PDF_OCR_PAGES
      ? `OCR was applied to the first ${MAX_PDF_OCR_PAGES} pages only for demo performance.`
      : "OCR was applied because this PDF did not expose normal selectable text.";

  return { text: ocrText, warning };
}

async function extractImageText(file) {
  const text = await recognizeImage(file, file.name);
  return {
    text,
    warning: "OCR was used for this image. Accuracy depends on image quality and language.",
  };
}

export async function extractTextFromFile(file) {
  const extension = getFileExtension(file.name);

  if (!SUPPORTED_MATERIAL_EXTENSIONS.includes(extension)) {
    throw new Error("Unsupported file type. Please use TXT, MD, PDF, DOCX, PPTX, PNG, JPG, WEBP, or BMP.");
  }

  if (extension === "txt" || extension === "md") {
    const text = cleanExtractedText(await file.text());
    if (!text) throw new Error(`${file.name} is empty or does not contain readable text.`);
    return { text, warning: "" };
  }

  if (extension === "docx" || extension === "pptx") {
    return extractOfficeText(file, extension);
  }

  if (extension === "pdf") {
    return extractPdfText(file);
  }

  if (IMAGE_EXTENSIONS.includes(extension)) {
    return extractImageText(file);
  }

  throw new Error("Unsupported file type.");
}
