export const helpTopics = [
  {
    id: "upload", label: "Upload", questions: [
      { question: "How do I upload study materials?", answer: "Open Upload, choose the correct course, click Choose Files, then click Upload All. Check the status message and the Current Course Materials list after uploading." },
      { question: "Why did my upload fail?", answer: "Check the Upload Rules for file size and course limits. Supported formats include TXT, MD, PDF, DOCX, PPTX, PNG, JPG, WEBP and BMP. The file must contain readable text. If it fails, note the exact error message and try a small TXT file to help identify the cause." },
      { question: "Where are my materials saved?", answer: "This demo saves material information and extracted text in this browser's local storage, not a cloud file drive. Keep your original files. Clearing browser data or changing browser or device can make saved materials unavailable." },
    ],
  },
  {
    id: "quiz", label: "Quiz", questions: [
      { question: "How do I start a quiz?", answer: "Open Quiz from the sidebar. Choose a course and select at least one material. Select an answer for each question, use Previous and Next to move between questions, then click Submit." },
      { question: "How do I review or retry my answers?", answer: "After submitting, you can see your score, your answers, correct answers and explanations. Retake Quiz restarts the whole quiz. Wrong-answer-only practice is not available yet." },
      { question: "Are questions generated from my files?", answer: "Not yet. The current Quiz uses fixed demo questions with working answer selection and scoring. Material-based question generation, multiple-correct-answer questions and adaptive difficulty are not available yet." },
    ],
  },
  {
    id: "review", label: "Review", questions: [
      { question: "How do I select several materials?", answer: "Open Summary or Q&A to enter the Study Workspace. Choose a course, then tick multiple files under Materials for AI, or click Select All. The selection only includes materials from the current course." },
      { question: "How do I review my learning materials?", answer: "Use Summary or Q&A in the Study Workspace. Summary currently displays demo content, not a generated summary of your files. For learning questions, use Q&A; its response is marked as demo or API mode depending on configuration." },
      { question: "Why can't I find my file?", answer: "Check that the correct course is selected, clear the material search field and check the Upload page. Materials saved in another browser or device are not automatically synced to this demo." },
    ],
  },
  {
    id: "other", label: "Other", questions: [
      { question: "Is this the learning AI chat?", answer: "No. Help Assistant provides preset instructions for using the app and does not call an AI API. To ask about your study materials, open Q&A from the sidebar." },
      { question: "My problem is not listed. What should I do?", answer: "Click Still need help? Create a ticket. Choose a category and describe the page, steps, expected result and actual result. My tickets shows your saved problems and replies. This is a local demo: an admin using this same browser can review tickets, but nothing is sent to a server. Do not include passwords, API keys or private information." },
    ],
  },
];
