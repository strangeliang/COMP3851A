import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LanguageContext = createContext(null);
const originalText = new WeakMap();

const zh = {
  "Overview": "概览", "Dashboard": "主页", "Upload": "上传", "AI Functions": "AI 功能",
  "Summary": "总结", "Q&A": "问答", "Quiz": "测验", "Flashcards": "记忆卡",
  "Study History": "学习历史", "Review Centre": "错题中心", "Settings": "设置",
  "My Profile": "个人资料", "Logout": "退出登录", "Your Profile": "个人资料",
  "Edit Profile": "编辑资料", "Recent Study": "最近学习", "Course": "课程",
  "Material": "学习材料", "Last Study Time": "最近学习时间", "Quick Entry": "快捷入口",
  "Upload Materials": "上传学习材料", "Continue Studying": "继续学习", "Courses": "课程",
  "Materials": "学习材料", "Completed Quiz": "已完成测验", "Average Score": "平均分数",
  "Create Course": "创建课程", "Course Code": "课程代码", "Course Name": "课程名称",
  "Selected": "已选择", "Select": "选择", "No material yet": "暂无学习材料",
  "Student Dashboard": "学生主页", "Study Workspace": "学习工作区", "Current Course": "当前课程",
  "Materials for AI": "用于 AI 的材料", "Select All": "全选", "Clear All": "清除选择",
  "Generate Summary": "生成总结", "Generate Flashcards": "生成记忆卡", "Generate Quiz": "生成测验",
  "Ask a Question": "提出问题", "Refresh records": "刷新记录", "All": "全部",
  "Upload Study Materials": "上传学习材料", "Upload Rules": "上传规则", "Upload All": "全部上传",
  "Cancel upload": "取消上传", "Delete": "删除", "Download original": "下载原文件",
  "Preview original": "预览原文件", "Save": "保存", "Cancel": "取消", "Register": "注册",
  "Log In": "登录", "Email": "邮箱", "Password": "密码", "Remember me": "记住我",
  "Forgot password?": "忘记密码？", "Welcome back": "欢迎回来", "Sign in with Google": "使用 Google 登录",
  "Register a student account": "注册学生账号", "Create account": "创建账号", "Full name": "姓名",
  "Confirm password": "确认密码", "Back to login": "返回登录", "Ask Me": "帮助",
  "Chat": "聊天", "My local tickets": "我的本地工单", "Send": "发送", "Clear chat": "清空聊天",
  "Solved": "已解决", "Confirm save": "确认保存", "Not solved — save ticket": "未解决——保存工单",
  "Practise the questions you originally answered incorrectly. Your original results are kept.": "重新练习之前答错的题目，原始成绩会被保留。",
  "Study records saved to your account on the server.": "查看保存在服务器账号中的学习记录。",
  "No saved wrong questions for this filter.": "当前筛选条件下没有已保存的错题。",
  "No materials in this course yet. Upload study files before using AI modes.": "该课程暂时没有学习材料，请先上传文件再使用 AI 功能。",
  "No materials yet. Use Upload Materials to add TXT or MD files to a course.": "暂无学习材料，请使用“上传学习材料”添加文件。",
};

const patterns = [
  [/^Welcome back, (.+)$/, "欢迎回来，$1"],
  [/^(\d+) shown$/, "显示 $1 项"],
  [/^(\d+) material\(s\)$/, "$1 个学习材料"],
  [/^Updated (.+)$/, "更新于 $1"],
];

function translateText(value) {
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const clean = value.trim();
  if (!clean) return value;
  if (zh[clean]) return leading + zh[clean] + trailing;
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(clean)) return leading + clean.replace(pattern, replacement) + trailing;
  }
  return value;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem("study-language") || "en");
  const toggleLanguage = () => setLanguage((value) => value === "en" ? "zh" : "en");

  useEffect(() => {
    localStorage.setItem("study-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    const translateNode = (root) => {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!originalText.has(root)) originalText.set(root, root.nodeValue);
        root.nodeValue = language === "zh" ? translateText(originalText.get(root)) : originalText.get(root);
        return;
      }
      if (!(root instanceof Element)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) translateNode(node);
      for (const attr of ["placeholder", "title", "aria-label"]) {
        if (root.hasAttribute(attr)) {
          const key = `data-i18n-${attr}`;
          if (!root.hasAttribute(key)) root.setAttribute(key, root.getAttribute(attr));
          const original = root.getAttribute(key);
          root.setAttribute(attr, language === "zh" ? translateText(original) : original);
        }
      }
      root.querySelectorAll("[placeholder],[title],[aria-label]").forEach((element) => {
        for (const attr of ["placeholder", "title", "aria-label"]) {
          if (!element.hasAttribute(attr)) continue;
          const key = `data-i18n-${attr}`;
          if (!element.hasAttribute(key)) element.setAttribute(key, element.getAttribute(attr));
          const original = element.getAttribute(key);
          element.setAttribute(attr, language === "zh" ? translateText(original) : original);
        }
      });
    };
    translateNode(document.body);
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(translateNode)));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
