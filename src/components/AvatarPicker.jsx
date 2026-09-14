import { useRef, useState } from "react";
import { useAppData } from "../state/AppDataContext";

export default function AvatarPicker({ initials }) {
  const { currentUser, saveProfile } = useAppData();
  const input = useRef(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const letters = currentUser?.name?.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || initials;
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose PNG, JPG or WEBP, up to 5 MB.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const side = Math.min(bitmap.width, bitmap.height);
      canvas.getContext("2d").drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 256, 256);
      bitmap.close();
      const image = canvas.toDataURL("image/png");
      if (image.length > 350000) throw new Error("Image is too complex. Please choose a simpler picture.");
      setDraft(image);
    } catch (e) { setError(e.message || "Could not read this image."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try {
      await saveProfile({ name: currentUser.name, bio: currentUser.bio || "", learningGoal: currentUser.learningGoal || "", avatar: draft });
      setDraft(null); setNotice("Avatar saved.");
    } catch (e) { setError(e.message || "Could not save. Please try again."); }
    finally { setBusy(false); }
  }
  const image = draft === null ? currentUser?.avatar : draft;
  return <div>
    <button className="profile-photo" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} type="button" aria-label="Change profile photo" title="Click to change your photo" disabled={busy} onClick={() => input.current?.click()}>
      {image ? <img src={image} alt="Your avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : letters}
    </button>
    <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} />
    <small>{busy ? "Please wait…" : "Click photo to change"}</small>
    {draft !== null && <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <small>Preview only. Save to update your profile.</small>
      <button type="button" disabled={busy} onClick={save}>Save photo</button>
      <button type="button" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
