export const fixedAccounts = [
  {
    id: 1,
    name: "Alex Chen",
    email: "student@example.com",
    role: "Student",
    status: "Active",
  },
  {
    id: 2,
    name: "Admin Lee",
    email: "admin@example.com",
    role: "Admin",
    status: "Active",
  },
  {
    id: 3,
    name: "Mia Tan",
    email: "mia@student.edu",
    role: "Student",
    status: "Active",
  },
  {
    id: 4,
    name: "John Lee",
    email: "john@student.edu",
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

