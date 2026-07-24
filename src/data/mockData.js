export const fixedAccounts = [
  {
    id: 1,
    name: "Alex Chen",
    email: "student@example.com",
    password: "student123",
    role: "Student",
    status: "Active",
  },
  {
    id: 2,
    name: "Admin Lee",
    email: "admin@example.com",
    password: "admin123",
    role: "Admin",
    status: "Active",
  },
  {
    id: 3,
    name: "Mia Tan",
    email: "mia@student.edu",
    password: "student123",
    role: "Student",
    status: "Active",
  },
  {
    id: 4,
    name: "John Lee",
    email: "john@student.edu",
    password: "student123",
    role: "Student",
    status: "Disabled",
  },
];

export const initialCourses = [
  {
    id: "inft3050",
    ownerId: 1,
    code: "INFT3050",
    name: "Study Companion",
    updatedAt: "Today 10:20",
  },
  {
    id: "hci",
    ownerId: 1,
    code: "HCI",
    name: "Prototype Review",
    updatedAt: "Yesterday 15:40",
  },
  {
    id: "inft3851a",
    ownerId: 1,
    code: "INFT3851A",
    name: "Study Project",
    updatedAt: "3 days ago",
  },
];

export const initialMaterials = [
  {
    id: 1,
    courseId: "inft3050",
    ownerId: 1,
    name: "lecture_notes.txt",
    type: "TXT",
    size: 1830,
    status: "Ready",
    uploadedAt: "Today",
    updatedAt: "Today 10:10",
    content: "Machine learning is a method that allows computers to learn patterns from data.",
  },
  {
    id: 2,
    courseId: "inft3050",
    ownerId: 1,
    name: "tutorial_outline.md",
    type: "MD",
    size: 940,
    status: "Ready",
    uploadedAt: "Yesterday",
    updatedAt: "Yesterday 18:05",
    content: "# Tutorial Outline\n- AI learning workflow\n- Source file selection\n- Quiz revision",
  },
  {
    id: 3,
    courseId: "inft3851a",
    ownerId: 1,
    name: "project_scope.md",
    type: "MD",
    size: 1500,
    status: "Ready",
    uploadedAt: "3 days ago",
    updatedAt: "3 days ago",
    content: "# Project Scope\nThis file explains course requirements and prototype scope.",
  },
];

export const mockSummary = {
  paragraph:
    "This mock summary explains the main ideas from the selected materials. It is demo data only and does not call a real AI API.",
  concepts: [
    "AI support should stay within the selected course materials.",
    "Courses separate materials so files from different subjects do not mix.",
    "Summary, Q&A, and Quiz are three different study modes.",
  ],
};

export const mockAnswers = [
  "Mock answer: the selected materials explain how a course-based study workspace keeps files and AI output organised.",
  "Mock answer: Q&A should use only the selected course materials, so unrelated content is excluded.",
  "Mock answer: this is demonstration content and does not call a real AI model.",
];

export const quizQuestions = [
  {
    id: 1,
    question: "Why does the system use Course to group materials?",
    options: [
      "To avoid mixing files from different subjects",
      "To delete files automatically",
      "To make every user an admin",
      "To remove the need for login",
    ],
    answerIndex: 0,
    explanation:
      "Course keeps related materials, Summary, Q&A, and Quiz output inside the correct subject area.",
  },
  {
    id: 2,
    question: "Which file types are supported in the current demo upload?",
    options: ["ZIP files", "TXT, MD, PDF, DOCX, PPTX, and images", "EXE files", "Video files only"],
    answerIndex: 1,
    explanation:
      "The updated prototype reads text from TXT/MD, extracts DOCX/PPTX/PDF content, and uses OCR for image-based files.",
  },
  {
    id: 3,
    question: "What should happen if no Source File is selected?",
    options: [
      "The system should use every file",
      "The operation should be disabled",
      "The admin dashboard should open",
      "The course should be deleted",
    ],
    answerIndex: 1,
    explanation:
      "Summary, Q&A, and Quiz require at least one selected course material, so actions stay disabled until a material is selected.",
  },
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES_PER_COURSE = 5;
export const MAX_TOTAL_FILES = 10;
