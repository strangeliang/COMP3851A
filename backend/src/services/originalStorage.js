const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { StudyError } = require("./studyContracts");

// Never expose this directory through express.static. Keys are server-generated.
function createOriginalStorage(databasePath) {
  const root = path.resolve(process.env.STUDY_UPLOAD_PATH || path.join(path.dirname(databasePath), "originals"));
  function location(key) {
    if (!/^[a-f0-9-]{36}\.bin$/.test(key)) throw new Error("Invalid storage key");
    return path.join(root, key);
  }
  return {
    location,
    async write(bytes) {
      await fs.mkdir(root, { recursive: true });
      const key = `${randomUUID()}.bin`;
      try { await fs.writeFile(location(key), bytes, { flag: "wx", mode: 0o600 }); }
      catch (error) { await fs.unlink(location(key)).catch(() => {}); throw error; }
      return { key, hash: createHash("sha256").update(bytes).digest("hex") };
    },
    async remove(key) {
      if (!key) return;
      try { await fs.unlink(location(key)); }
      catch (error) { if (error.code !== "ENOENT") console.error("Original cleanup failed:", error.code); }
    },
  };
}

function validateOriginal(bytes, material) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== material.size_bytes || !bytes.length) {
    throw new StudyError(400, "INVALID_ORIGINAL", "Original file size does not match the uploaded material.");
  }
  const hex = bytes.subarray(0, 12).toString("hex");
  const valid = {
    PDF: bytes.subarray(0, 5).toString() === "%PDF-",
    PNG: hex.startsWith("89504e470d0a1a0a"),
    JPG: hex.startsWith("ffd8ff"), JPEG: hex.startsWith("ffd8ff"),
    WEBP: bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
    BMP: hex.startsWith("424d"), PPTX: hex.startsWith("504b0304"), DOCX: hex.startsWith("504b0304"),
    TXT: true, MD: true,
  };
  if (!valid[material.type]) throw new StudyError(400, "INVALID_ORIGINAL", "Original file format does not match its type.");
}
module.exports = { createOriginalStorage, validateOriginal };
