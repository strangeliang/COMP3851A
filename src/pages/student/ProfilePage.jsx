import { useRef, useState } from "react";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";

export default function ProfilePage() {
  const { currentUser, saveProfile } = useAppData();
  const [form, setForm] = useState(() => ({ name: currentUser.name, bio: currentUser.bio || "", learningGoal: currentUser.learningGoal || "", avatar: currentUser.avatar || "" }));
  const [pending, setPending] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const imageVersion = useRef(0);
  const fileInput = useRef(null);
  function field(key, value) { setForm((old) => ({ ...old, [key]: value })); setMessage(""); }
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++imageVersion.current;
    setError(""); setImagePending(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a PNG, JPG or WEBP image up to 5 MB.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const side = Math.min(bitmap.width, bitmap.height);
      canvas.getContext("2d").drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 256, 256);
      bitmap.close();
      const avatar = canvas.toDataURL("image/png");
      if (avatar.length > 350000) throw new Error("Image is too complex. Please choose a simpler image.");
      if (version === imageVersion.current) field("avatar", avatar);
    } catch (err) { if (version === imageVersion.current) setError(err.message || "Could not read this image."); }
    finally { if (version === imageVersion.current) setImagePending(false); event.target.value = ""; }
  }
  return <StudentLayout><header className="workspace-header"><h1>My Profile</h1><p>Your personal study profile. This is not a public page.</p></header>
    <form className="user-card" style={{ padding: 24, maxWidth: 700 }} onSubmit={async (event) => {
      event.preventDefault(); if (pending || imagePending) return;
      setPending(true); setError(""); setMessage("");
      try { await saveProfile(form); setMessage("Profile saved."); } catch (err) { setError(err.message); } finally { setPending(false); }
    }}>
      <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 18 }}>
        <div>{form.avatar ? <img src={form.avatar} alt="Avatar preview" width={96} height={96} style={{ borderRadius: "50%" }} /> : <p>Default avatar (your initials)</p>}</div>
        <label className="user-field">Choose avatar (PNG, JPG or WEBP, up to 5 MB)<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></label>
        <small>Images are centre-cropped to a square. Click Save Profile to keep changes.</small>
        <button type="button" onClick={() => { imageVersion.current++; setImagePending(false); field("avatar", ""); if (fileInput.current) fileInput.current.value = ""; }}>Restore default avatar</button>
        <label className="user-field">Display name<input required maxLength={80} value={form.name} onChange={(e) => field("name", e.target.value)} /></label>
        <label className="user-field">About me<textarea maxLength={500} rows={3} value={form.bio} onChange={(e) => field("bio", e.target.value)} /></label>
        <label className="user-field">Learning goals<textarea maxLength={1000} rows={4} value={form.learningGoal} onChange={(e) => field("learningGoal", e.target.value)} /></label>
        <label className="user-field">Email (read only)<input readOnly value={currentUser.email} /></label>
        <label className="user-field">Role (read only)<input readOnly value={currentUser.role} /></label>
        <div style={{ display: "flex", gap: 12 }}><button className="primary-button" disabled={imagePending} type="submit">{pending ? "Saving…" : imagePending ? "Preparing image…" : "Save Profile"}</button>
        <button type="button" onClick={() => { imageVersion.current++; setImagePending(false); setForm({ name: currentUser.name, bio: currentUser.bio || "", learningGoal: currentUser.learningGoal || "", avatar: currentUser.avatar || "" }); setError(""); setMessage(""); }}>Discard changes</button></div>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    </form></StudentLayout>;
}
