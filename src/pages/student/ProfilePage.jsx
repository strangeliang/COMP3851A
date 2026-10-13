import { useRef, useState } from "react";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import { useLanguage } from "../../state/LanguageContext";
import "./ProfilePage.css";

export default function ProfilePage() {
  const { currentUser, saveProfile } = useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const [form, setForm] = useState(() => ({ name: currentUser.name, bio: currentUser.bio || "", learningGoal: currentUser.learningGoal || "", avatar: currentUser.avatar || "" }));
  const [pending, setPending] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarFileName, setAvatarFileName] = useState("");
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
      if (version === imageVersion.current) { field("avatar", avatar); setAvatarFileName(file.name); }
    } catch (err) { if (version === imageVersion.current) setError(err.message || "Could not read this image."); }
    finally { if (version === imageVersion.current) setImagePending(false); event.target.value = ""; }
  }
  return <StudentLayout><div className="student-profile-page" data-react-i18n><header className="workspace-header"><h1>{t("My Profile", "个人资料")}</h1><p>{t("Your personal study profile. This is not a public page.", "你的个人学习资料，仅供自己使用，不是公开页面。")}</p></header>
    <form className="user-card profile-editor" onSubmit={async (event) => {
      event.preventDefault(); if (pending || imagePending) return;
      setPending(true); setError(""); setMessage("");
      try { await saveProfile(form); setMessage(t("Profile saved.", "个人资料已保存。")); } catch (err) { setError(err.message); } finally { setPending(false); }
    }}>
      <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 18 }}>
        <div className="profile-avatar-preview">{form.avatar ? <img src={form.avatar} alt={t("Avatar preview", "头像预览")} width={96} height={96} /> : <><span className="profile-default-avatar" aria-hidden="true">{form.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "S"}</span><p>{t("Default avatar (your initials)", "默认头像（姓名首字母）")}</p></>}</div>
        <div className="user-field" data-react-i18n>
          <label htmlFor="profile-avatar-upload">{t("Choose avatar (PNG, JPG or WEBP, up to 5 MB)", "选择头像（PNG、JPG 或 WEBP，不超过 5 MB）")}</label>
          <input hidden id="profile-avatar-upload" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => fileInput.current?.click()}>{t("Choose file", "选择文件")}</button>
            <span style={{ overflowWrap: "anywhere" }}>{avatarFileName || t("No file chosen", "未选择任何文件")}</span>
          </div>
        </div>
        <small>{t("Images are centre-cropped to a square. Click Save Profile to keep changes.", "图片会从中心裁剪为正方形，点击保存个人资料后生效。")}</small>
        <button type="button" onClick={() => { imageVersion.current++; setImagePending(false); setAvatarFileName(""); field("avatar", ""); if (fileInput.current) fileInput.current.value = ""; }}>{t("Restore default avatar", "恢复默认头像")}</button>
        <label className="user-field">{t("Display name", "显示名称")}<input required maxLength={80} value={form.name} onChange={(e) => field("name", e.target.value)} /></label>
        <label className="user-field">{t("About me", "个人简介")}<textarea maxLength={500} rows={3} value={form.bio} onChange={(e) => field("bio", e.target.value)} /></label>
        <label className="user-field">{t("Learning goals", "学习目标")}<textarea maxLength={1000} rows={4} value={form.learningGoal} onChange={(e) => field("learningGoal", e.target.value)} /></label>
        <label className="user-field">{t("Email (read only)", "邮箱（只读）")}<input readOnly value={currentUser.email} /></label>
        <label className="user-field">{t("Role (read only)", "角色（只读）")}<input readOnly value={t(currentUser.role, currentUser.role === "Admin" ? "管理员" : "学生")} /></label>
        <div style={{ display: "flex", gap: 12 }}><button className="primary-button" disabled={imagePending} type="submit">{pending ? t("Saving…", "保存中…") : imagePending ? t("Preparing image…", "正在处理图片…") : t("Save Profile", "保存个人资料")}</button>
        <button type="button" onClick={() => { imageVersion.current++; setImagePending(false); setAvatarFileName(""); setForm({ name: currentUser.name, bio: currentUser.bio || "", learningGoal: currentUser.learningGoal || "", avatar: currentUser.avatar || "" }); setError(""); setMessage(""); }}>{t("Discard changes", "放弃修改")}</button></div>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    </form></div></StudentLayout>;
}
