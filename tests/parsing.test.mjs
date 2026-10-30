import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { loadSource, deferred } from "./helpers.mjs";

test("small nonempty files display bytes and retain the KB and MB boundaries", async () => {
  const { formatFileSize } = await loadSource("src/utils/fileTextExtractor.js");
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(467), "467 B");
  assert.equal(formatFileSize(1023), "1023 B");
  assert.equal(formatFileSize(1024), "1 KB");
  assert.equal(formatFileSize(1024 * 1024), "1 MB");
});

function officeFile(name, entries, reportedSize) {
  const locals = []; const directory = []; let offset = 0;
  for (const [entryName, text] of entries) {
    const fileName = Buffer.from(entryName); const plain = Buffer.from(text); const compressed = deflateRawSync(plain);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(reportedSize ?? plain.length, 22); local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(reportedSize ?? plain.length, 24);
    central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, compressed); directory.push(central, fileName); offset += local.length + fileName.length + compressed.length;
  }
  const central = Buffer.concat(directory); const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50); footer.writeUInt16LE(entries.length, 8); footer.writeUInt16LE(entries.length, 10);
  footer.writeUInt32LE(central.length, 12); footer.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...locals, central, footer]);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
}

test("TXT parsing keeps the entire text rather than clipping at the former 13,000-character boundary", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const content = "First fact. " + "a".repeat(20000) + " FINAL FACT.";
  const result = await extractTextFromFile({ name: "course.txt", text: async () => content });
  assert.equal(result.text, content);
});

test("empty files and cancellation are handled without accepting a partial document", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  await assert.rejects(extractTextFromFile({ name: "blank.txt", text: async () => "\n \t" }), /empty/);
  const controller = new AbortController(); controller.abort();
  let read = false;
  await assert.rejects(extractTextFromFile({ name: "cancelled.txt", text: async () => { read = true; return "text"; } }, { signal: controller.signal }), (error) => error.name === "AbortError");
  assert.equal(read, false);
});

test("PPTX slides retain their numeric order and source markers", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const xml = (text) => `<a:root xmlns:a="urn:test"><a:p><a:t>${text}</a:t></a:p></a:root>`;
  const file = officeFile("slides.pptx", [["ppt/slides/slide10.xml", xml("Last slide")], ["ppt/slides/slide2.xml", xml("Earlier slide")]]);
  const result = await extractTextFromFile(file);
  assert.ok(result.text.indexOf("Slide 2") < result.text.indexOf("Slide 10"));
  assert.match(result.text, /Last slide/);
});

test("Office decompression rejects oversized metadata and inflated data exceeding the declared size", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const entries = [["word/document.xml", "a".repeat(10000)]];
  await assert.rejects(extractTextFromFile(officeFile("oversized.docx", entries, 21 * 1024 * 1024)), /expands beyond 20 MB/);
  await assert.rejects(extractTextFromFile(officeFile("wrong-size.docx", entries, 10)), /safe reading limit/);
});

async function pdfFixture(pages) {
  const calls = { ocr: [], languages: [], destroyed: false, terminated: false };
  const pdf = { numPages: pages.length, getPage: async (number) => ({
    getTextContent: async () => ({ items: [{ str: pages[number - 1].text || "" }] }),
    getViewport: () => ({ width: 100, height: 100 }),
    render: ({ canvasContext }) => { canvasContext.canvas.page = number; return { promise: Promise.resolve(), cancel() {} }; },
  }), destroy: async () => { calls.destroyed = true; } };
  const worker = { recognize: async (blob) => { const number = Number(await blob.text()); calls.ocr.push(number); return { data: { text: pages[number - 1].ocr || "" } }; },
    terminate: async () => { calls.terminated = true; } };
  const parser = await loadSource("src/utils/fileTextExtractor.js", {
    "pdfjs-dist": { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(pdf), destroy: async () => {} }) },
    "tesseract.js": { createWorker: async (languages) => { calls.languages = languages; return worker; } },
  }, { document: { createElement: () => {
    const canvas = { width: 0, height: 0, page: 0 };
    canvas.getContext = () => ({ canvas });
    canvas.toBlob = (callback) => callback(new Blob([String(canvas.page)]));
    return canvas;
  } } });
  return { calls, extract: () => parser.extractTextFromFile({ name: "mixed.pdf", arrayBuffer: async () => new ArrayBuffer(1) }) };
}

test("a mixed PDF reads its scanned pages even when other pages have selectable text; blank pages do not abort it", async () => {
  const fixture = await pdfFixture([{ text: "Selectable text from the first page is long enough." }, { ocr: "第二页的扫描资料" }, { ocr: "" }]);
  const result = await fixture.extract();
  assert.match(result.text, /Page 1/);
  assert.match(result.text, /Page 2\n第二页的扫描资料/);
  assert.deepEqual(fixture.calls.ocr, [2, 3]);
  assert.deepEqual(fixture.calls.languages, ["eng", "chi_sim"]);
  assert.match(result.warning, /page\(s\) 3/);
  assert.equal(fixture.calls.destroyed, true);
  assert.equal(fixture.calls.terminated, true);
});

test("PDFs over the OCR or page limit fail explicitly instead of accepting only the first pages", async () => {
  const scanned = await pdfFixture(Array.from({ length: 21 }, () => ({ ocr: "text" })));
  await assert.rejects(scanned.extract(), /no more than 20 pages/);
  assert.equal(scanned.calls.ocr.length, 0);
  const long = await pdfFixture(Array.from({ length: 101 }, () => ({ text: "Selectable text from this page is long enough." })));
  await assert.rejects(long.extract(), /no more than 100 pages/);
  assert.equal(long.calls.destroyed, true);
});

test("a stalled OCR worker initialization times out and releases a worker that finishes late", async () => {
  const ready = deferred(); let terminated = false, logger;
  const progress = [];
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", { "tesseract.js": { createWorker: (_languages, _engine, options) => { logger = options.logger; return ready.promise; } } }, {
    setTimeout: (callback) => setTimeout(callback, 15), clearTimeout,
    createImageBitmap: async () => ({ width: 10, height: 10, close() {} }),
  });
  await assert.rejects(extractTextFromFile({ name: "scan.png" }, { onProgress: value => progress.push(value) }), /longer than 3 minutes/);
  const completedProgress = [...progress];
  logger({ status: 'loading language', progress: 0.5 });
  assert.deepEqual(progress, completedProgress, 'A timed-out task must not put the upload back into a pending state');
  ready.resolve({ terminate: async () => { terminated = true; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(terminated, true);
});

test("cancelled image decoding closes a bitmap that resolves after cancellation without starting OCR", async () => {
  for (const resolveBeforeAbort of [false, true]) {
    const decoded = deferred(), controller = new AbortController();
    let closed = 0, workers = 0;
    const bitmap = { width: 100, height: 100, close() { closed++; } };
    const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", {
      "tesseract.js": { createWorker: async () => { workers++; throw Error('Unexpected OCR'); } },
    }, { createImageBitmap: () => decoded.promise });
    const operation = extractTextFromFile({ name: "cancelled.png" }, { signal: controller.signal });
    const cancelled = assert.rejects(operation, error => error.name === 'AbortError');
    if (resolveBeforeAbort) decoded.resolve(bitmap);
    controller.abort();
    await cancelled;
    if (!resolveBeforeAbort) decoded.resolve(bitmap);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, 1); assert.equal(workers, 0);
  }
});

test("oversized image validation closes its bitmap and never creates an OCR worker", async () => {
  let closed = 0, workers = 0;
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", {
    "tesseract.js": { createWorker: async () => { workers++; throw Error('Unexpected OCR'); } },
  }, { createImageBitmap: async () => ({ width: 5000, height: 5000, close() { closed++; } }) });
  await assert.rejects(extractTextFromFile({ name: "large.png" }), /20 million pixels/);
  assert.equal(closed, 1); assert.equal(workers, 0);
});

test("failed PDF loading destroys its loading task while preserving the original error", async () => {
  let destroyed = 0;
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", {
    "pdfjs-dist": { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(Error('Invalid PDF structure')),
      destroy: async () => { destroyed++; } }) },
  });
  await assert.rejects(extractTextFromFile({ name: "broken.pdf", arrayBuffer: async () => new ArrayBuffer(1) }), /Invalid PDF structure/);
  assert.equal(destroyed, 1);
});

test("cancelling PDF loading destroys the task once and tolerates a cleanup failure", async () => {
  let destroyed = 0;
  const loaded = deferred(), started = deferred(), controller = new AbortController();
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", {
    "pdfjs-dist": { GlobalWorkerOptions: {}, getDocument: () => { started.resolve(); return { promise: loaded.promise,
      destroy: async () => { destroyed++; loaded.reject(Error('Loading stopped')); throw Error('Worker cleanup failed'); } }; } },
  });
  const cancelled = assert.rejects(extractTextFromFile({ name: "loading.pdf", arrayBuffer: async () => new ArrayBuffer(1) }, { signal: controller.signal }), error => error.name === 'AbortError');
  await started.promise; controller.abort();
  await cancelled;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(destroyed, 1);
});
