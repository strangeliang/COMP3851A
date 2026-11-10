import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { randomBytes } from "node:crypto";
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

async function mutateOfficeFile(file, mutate) {
  const buffer = await file.arrayBuffer();
  mutate(new DataView(buffer));
  return { ...file, arrayBuffer: async () => buffer };
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

test("Office decompression rejects oversized selected XML and inflated data exceeding the declared size", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const entries = [["word/document.xml", "a".repeat(10000)]];
  await assert.rejects(extractTextFromFile(officeFile("oversized.docx", entries, 21 * 1024 * 1024)), /text inside.*exceeds 20 MB after decompression.*separate from the original file size/);
  await assert.rejects(extractTextFromFile(officeFile("wrong-size.docx", entries, 10)), /safe reading limit/);
  await assert.rejects(extractTextFromFile(officeFile("truncated.docx", entries, 10001)), /invalid compressed entry/);
});

test("six MB DOCX and PPTX packages read text without expanding their 24 MB embedded bitmap", async () => {
  let inflated = 0;
  const NativeDecompressionStream = globalThis.DecompressionStream;
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", {}, {
    DecompressionStream: class {
      constructor(format) { inflated++; return new NativeDecompressionStream(format); }
    },
  });
  const xml = '<a:root xmlns:a="urn:test"><a:p><a:t>Course concepts remain readable.</a:t></a:p></a:root>';
  // A real 2048 x 4096, 24-bit BMP: a detailed region and a large blank region.
  const media = Buffer.alloc(54 + 24 * 1024 * 1024);
  media.write("BM"); media.writeUInt32LE(media.length, 2); media.writeUInt32LE(54, 10); media.writeUInt32LE(40, 14);
  media.writeInt32LE(2048, 18); media.writeInt32LE(4096, 22); media.writeUInt16LE(1, 26); media.writeUInt16LE(24, 28);
  randomBytes(6 * 1024 * 1024).copy(media, 54);
  for (const [extension, textPath, mediaPath] of [
    ["pptx", "ppt/slides/slide1.xml", "ppt/media/image1.bmp"],
    ["docx", "word/document.xml", "word/media/image1.bmp"],
  ]) {
    const file = officeFile(`media-heavy.${extension}`, [[textPath, xml], [mediaPath, media]]);
    assert.ok(file.size > 5 * 1024 * 1024 && file.size < 10 * 1024 * 1024);
    const before = inflated;
    const result = await extractTextFromFile(file);
    assert.match(result.text, /Course concepts remain readable/);
    assert.equal(inflated - before, 1, "Only document or slide XML is decompressed");
    if (extension === "pptx") assert.match(result.warning, /vector notation, and equations may lose their layout/);
  }
});

test("the Office text limit applies across selected slides and malformed ZIP metadata is rejected", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const slides = [["ppt/slides/slide1.xml", "one"], ["ppt/slides/slide2.xml", "two"]];
  await assert.rejects(extractTextFromFile(officeFile("combined-limit.pptx", slides, 11 * 1024 * 1024)), /text inside.*exceeds 20 MB after decompression/);
  await assert.rejects(extractTextFromFile({ name: "invalid.pptx", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }), /could not be opened as a ZIP/);
  const file = officeFile("broken-directory.docx", [["word/document.xml", "hello"]]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  new DataView(bytes.buffer).setUint32(bytes.length - 6, bytes.length + 100, true);
  await assert.rejects(extractTextFromFile({ name: file.name, arrayBuffer: async () => bytes.buffer }), /invalid central directory/);
});

test("Office compressed reads stay within the original file limit and reject incomplete reads", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const limit = 10 * 1024 * 1024;
  let reads = 0;
  await assert.rejects(extractTextFromFile({ name: "oversized.docx", size: limit + 1,
    arrayBuffer: async () => { reads++; throw Error("Must not read an oversized file"); },
  }), /original Office file exceeds 10 MB/);
  assert.equal(reads, 0);

  const file = officeFile("bounded.docx", [["word/document.xml", "A readable document."]]);
  let range;
  const result = await extractTextFromFile({ ...file, slice: (start, end) => { range = [start, end]; return file; } });
  assert.match(result.text, /A readable document/);
  assert.deepEqual(range, [0, limit + 1]);
  await assert.rejects(extractTextFromFile({ ...file, size: 1, arrayBuffer: async () => new ArrayBuffer(limit + 1) }), /original Office file exceeds 10 MB/);
  await assert.rejects(extractTextFromFile({ ...file, size: file.size + 1 }), /could not be read completely/);
});

test("Office ZIP directory counts, lengths, and selected compressed ranges cannot hide truncated content", async () => {
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js");
  const file = officeFile("malformed.docx", [["word/document.xml", "Readable document."]]);
  const cases = [
    [(view) => { view.setUint16(view.byteLength - 12, 2001, true); }, /too many package entries/],
    [(view) => { view.setUint32(view.byteLength - 10, 45, true); }, /invalid central directory entry/],
    [(view) => { view.setUint16(view.byteLength - 2, 1, true); }, /could not be opened as a ZIP/],
    [(view) => {
      const directory = view.getUint32(view.byteLength - 6, true);
      view.setUint32(directory + 20, directory, true);
    }, /invalid compressed entry data/],
  ];
  for (const [mutate, message] of cases) await assert.rejects(extractTextFromFile(await mutateOfficeFile(file, mutate)), message);
});

test("Office decompression stops reading and cancels as soon as actual output exceeds its declaration", async () => {
  let reads = 0, cancelled = 0;
  const { extractTextFromFile } = await loadSource("src/utils/fileTextExtractor.js", {}, {
    DecompressionStream: class {},
    Blob: class { stream() { return { pipeThrough: () => ({ getReader: () => ({
      read: async () => { reads++; return { done: false, value: new Uint8Array(reads === 1 ? 10000 : 1) }; },
      cancel: async () => { cancelled++; },
    }) }) }; } },
  });
  const file = officeFile("undeclared-expansion.docx", [["word/document.xml", "hello"]], 10000);
  await assert.rejects(extractTextFromFile(file), /safe reading limit/);
  assert.equal(reads, 2);
  assert.equal(cancelled, 1);
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
