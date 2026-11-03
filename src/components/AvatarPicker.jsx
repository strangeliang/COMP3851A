import { useEffect, useRef, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useLanguage } from "../state/LanguageContext";
import { workspaceSessionId } from "../services/workspaceSession";

export default function AvatarPicker({ initials }) {
  const { currentUser } = useAppData();
  return currentUser ? <AvatarEditor key={`${currentUser.id}:${workspaceSessionId()}`} initials={initials} /> : null;
}

function AvatarEditor({ initials }) {
  const { currentUser, saveProfile } = useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const input = useRef(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const version = useRef(0);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const letters = currentUser?.name?.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || initials;
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const requestVersion = ++version.current;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error(t("Choose PNG, JPG or WEBP, up to 5 MB.", "请选择 PNG、JPG 或 WEBP 图片，大小不超过 5 MB。"));
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error(t("Could not read this image. Try another PNG, JPG or WEBP file.", "无法读取这张图片，请尝试其他 PNG、JPG 或 WEBP 文件。")); });
      try {
        if (!mounted.current || requestVersion !== version.current) return;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const side = Math.min(bitmap.width, bitmap.height);
        canvas.getContext("2d").drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 256, 256);
        const image = canvas.toDataURL("image/png");
        if (image.length > 350000) throw new Error(t("Image is too complex. Please choose a simpler picture.", "图片过于复杂，请选择内容更简单的图片。"));
        setDraft(image);
      } finally { bitmap.close(); }
    } catch (e) { if (mounted.current && requestVersion === version.current) setError(e.message || t("Could not read this image.", "无法读取这张图片。")); }
    finally { if (mounted.current && requestVersion === version.current) setBusy(false); }
  }
  async function save() {
    if (saveLock.current || busy || draft === null) return;
    saveLock.current = true;
    setBusy(true); setError("");
    try {
      await saveProfile({ name: currentUser.name, bio: currentUser.bio || "", learningGoal: currentUser.learningGoal || "", avatar: draft });
      if (mounted.current) { setDraft(null); setNotice(t("Avatar saved.", "头像已保存。")); }
    } catch (e) { if (mounted.current) setError(e.message || t("Could not save. Please try again.", "暂时无法保存，请重试。")); }
    finally { saveLock.current = false; if (mounted.current) setBusy(false); }
  }
  const image = draft === null ? currentUser?.avatar : draft;
  return <div data-react-i18n>
    <button className="profile-photo" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} type="button" aria-label={t("Change profile photo", "更换头像")} title={t("Click to change your photo", "点击更换头像")} disabled={busy} onClick={() => input.current?.click()}>
      {image ? <img src={image} alt={t("Your avatar", "你的头像")} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : letters}
    </button>
    <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} />
    <small>{busy ? t("Please wait…", "请稍候…") : t("Click photo to change", "点击头像更换")}</small>
    {draft !== null && <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <small>{t("Preview only. Save to update your profile.", "仅供预览，保存后才会更新个人资料。")}</small>
      <button type="button" disabled={busy} onClick={save}>{t("Save photo", "保存头像")}</button>
      <button type="button" disabled={busy} onClick={() => { version.current++; setDraft(null); setError(""); }}>{t("Cancel", "取消")}</button>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
