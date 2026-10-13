import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { translatedValue } from "../utils/translationCache";

const LanguageContext = createContext(null);
const originalText = new WeakMap();

const zh = {
  "Front": "正面", "Back": "背面", "AI Flashcards": "AI 记忆卡",
  "Generate New Cards": "重新生成卡片", "Generate New Quiz": "重新生成测验",
  "Generating…": "生成中…", "Stop generating": "停止生成",
  "Generating flashcards…": "正在生成记忆卡…", "Generating questions…": "正在生成题目…",
  "Generate six revision cards from the selected materials. Click a card to reveal its answer.": "从所选材料生成六张复习卡片，点击卡片查看答案。",
  "Click to show the front": "点击查看正面", "Click to reveal the answer": "点击查看答案",
  "Generate flashcards to start revising.": "生成记忆卡后即可开始复习。",
  "Generate a quiz to start practising.": "生成测验后即可开始练习。",
  "Previous": "上一题", "Next": "下一题", "Submit": "提交",
  "Your answer:": "你的答案：", "Correct answer:": "正确答案：", "Explanation:": "解析：",
  "Please answer every question before submitting.": "请回答所有题目后再提交。",
  "Answer style": "回答方式", "Simple": "简明", "Detailed": "详细", "Example": "举例", "Hint Only": "只给提示",
  "Difficulty": "难度", "Easy": "简单", "Medium": "中等", "Hard": "困难",
  "Change profile photo": "更换头像", "Click to change your photo": "点击更换头像",
  "Click photo to change": "点击头像更换", "Your avatar": "你的头像",
  "Preview only. Save to update your profile.": "仅供预览，保存后才会更新个人资料。",
  "Save photo": "保存头像", "Avatar saved.": "头像已保存。", "Please wait…": "请稍候…",
  "Checking your session…": "正在检查登录状态…", "Retry saving / refresh": "重试保存／刷新",
  "Q&A Chat": "问答聊天", "Key Concepts": "核心概念", "Student": "学生", "Admin": "管理员",
  "Correct": "正确", "Incorrect": "错误", "Practise again": "再次练习",
  "Number of questions (1–20)": "题目数量（1–20）",
  "Enter a whole number of questions from 1 to 20.": "请输入 1 到 20 之间的整数题数。",
  "Multiple answers — select all that apply": "多选题——请选择所有正确选项",
  "Single answer — select one option": "单选题——请选择一个选项",
  "Choose 1–20 questions. Quizzes mix single-answer and multiple-answer questions when there is more than one question. Select all correct options; no partial credit. Check AI explanations against the sources.": "可选择 1–20 题，多于一题时混合单选与多选。必须选中全部正确选项且不能错选，不计部分分数。请对照资料核查 AI 解析。",
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
  "Support Tickets": "问题工单", "My tickets": "我的工单",
  "Solved": "已解决", "Confirm save": "确认保存", "Not solved — save ticket": "未解决——保存工单",
  "Practise the questions you originally answered incorrectly. Your original results are kept.": "重新练习之前答错的题目，原始成绩会被保留。",
  "Study records saved to your account on the server.": "查看保存在服务器账号中的学习记录。",
  "No saved wrong questions for this filter.": "当前筛选条件下没有已保存的错题。",
  "No materials in this course yet. Upload study files before using AI modes.": "该课程暂时没有学习材料，请先上传文件再使用 AI 功能。",
  "No materials yet. Use Upload Materials to add TXT or MD files to a course.": "暂无学习材料，请使用“上传学习材料”添加文件。",
};

const patterns = [
  [/^Question (\d+) of (\d+)$/, "第 $1 题，共 $2 题"],
  [/^Welcome back, (.+)$/, "欢迎回来，$1"],
  [/^(\d+) shown$/, "显示 $1 项"],
  [/^(\d+) material\(s\)$/, "$1 个学习材料"],
  [/^Updated (.+)$/, "更新于 $1"],
];

function translateText(value) {
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return value;
  if (zh[clean]) return leading + zh[clean] + trailing;
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(clean)) return leading + clean.replace(pattern, replacement) + trailing;
  }
  return value;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem("study-language") === "zh" ? "zh" : "en"; } catch { return "en"; }
  });
  const toggleLanguage = () => setLanguage((value) => value === "en" ? "zh" : "en");

  useEffect(() => {
    try { localStorage.setItem("study-language", language); } catch { /* Language remains usable without browser storage. */ }
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    const translateNode = (root) => {
      if (root.nodeType === Node.TEXT_NODE) {
        if (root.parentElement?.closest('[data-react-i18n]')) return;
        const value = translatedValue(originalText, root, 'text', root.nodeValue, translateText, language === 'zh');
        if (root.nodeValue !== value) root.nodeValue = value;
        return;
      }
      if (!(root instanceof Element)) return;
      if (root.closest('[data-react-i18n]')) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) translateNode(node);
      [root, ...root.querySelectorAll("[placeholder],[title],[aria-label]")].forEach((element) => {
        if (element.closest('[data-react-i18n]')) return;
        for (const attr of ["placeholder", "title", "aria-label"]) {
          if (!element.hasAttribute(attr)) continue;
          const current = element.getAttribute(attr);
          const value = translatedValue(originalText, element, attr, current, translateText, language === 'zh');
          if (current !== value) element.setAttribute(attr, value);
        }
      });
    };
    translateNode(document.body);
    const observer = new MutationObserver((records) => records.forEach((record) => {
      if (record.type === 'characterData' || record.type === 'attributes') translateNode(record.target);
      else record.addedNodes.forEach(translateNode);
    }));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
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
