// Clarify only the original demo titles. User-created course names are unchanged.
const demoTitles = {
  INFT3050: ["Study Companion", "AI-Assisted Learning"],
  HCI: ["Prototype Review", "User Interface Design"],
  INFT3851A: ["Study Project", "Applied Computing Project"],
};
export function courseName(course) {
  if (!course) return "";
  const demo = demoTitles[String(course.code).toUpperCase()];
  return demo && course.name === demo[0] ? demo[1] : course.name || course.code || "Untitled course";
}
export function courseLabel(course) {
  if (!course) return "";
  const name = courseName(course);
  return course.code && name !== course.code ? `${name} (${course.code})` : name;
}
