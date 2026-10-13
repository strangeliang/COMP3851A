// Preset website help only. Never claims to be AI or a human administrator.
function supportFaq(text, language) {
  const zh = language === 'zh';
  const rules = [
    [/login|log in|sign in|登录|session|过期/i,
      'If your session expired, sign in again. For Google sign-in, use the Google button. Describe any error here without passwords or verification codes.',
      '会话过期时请重新登录。使用 Google 账号请点击 Google 登录按钮。如有错误，可在这里描述，但不要发送密码或验证码。'],
    [/register|account|password|注册|账号|密码/i,
      'Registration requires a six-digit email verification code. For a forgotten password, use /reset-password to request a one-time email link, valid for 15 minutes. Email delivery requires the server email service to be configured. If it is unavailable, contact support through /forgot-password; that creates a recovery request, not a password change or email. Google sign-in requires configuration and Google passwords are managed by Google. Never share credentials in chat.',
      '注册需要通过邮箱中的六位验证码验证。忘记密码时，打开 /reset-password 申请一次性邮件链接，15 分钟内有效。邮件发送需要服务器完成邮箱服务配置；若服务不可用，可通过 /forgot-password 申请管理员协助，该申请本身不会修改密码或发送邮件。Google 登录需要完成配置，Google 密码由 Google 管理。请勿在聊天中发送登录凭据。'],
    [/upload|file|pdf|ppt|上传|文件/i,
      'Open Upload, select a course and files, then Upload All. Each file must be at most 10 MB. Use PPTX rather than PPT. Check the error shown if uploading fails.',
      '打开 Upload，选择课程和文件，然后点击 Upload All。每个文件最大 10 MB，请使用 PPTX 而不是 PPT。上传失败时请描述页面显示的错误。'],
    [/history|历史|record|记录/i,
      'Open Study History, select your course or All, and refresh records. Summaries, Q&A, submitted quizzes and flashcards are saved to your account. Report any missing recent record here.',
      '打开 Study History，选择课程或 All 并刷新记录。摘要、问答、已提交测验和闪卡会保存到你的账号。如近期记录缺失，可在这里描述。'],
    [/quiz|review|错题|测验|练习/i,
      'Open AI Functions → Quiz, select materials, generate questions, answer and submit. Review Centre contains saved wrong answers. Practice does not replace the original score.',
      '进入 AI Functions → Quiz，选择材料、生成题目、作答并提交。Review Centre 显示已保存的错题，重练不会覆盖原始成绩。'],
  ];
  const rule = rules.find(([pattern]) => pattern.test(text));
  return rule ? rule[zh ? 2 : 1] : (zh
    ? '这是预设帮助回复。请说明所在页面、操作步骤及错误，不要包含敏感信息。本客服会话已保存，管理员可查看和回复；目前没有邮件提醒，也不保证即时回复。'
    : 'This is preset help. Describe the page, steps and error without sensitive information. This support conversation is saved for administrators to review and reply. There are no email notifications or guaranteed immediate replies.');
}
module.exports = { supportFaq };
