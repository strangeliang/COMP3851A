import { apiRequest, APIError } from "./apiClient";
import { selectionError, materialIsIncomplete, limits } from "../utils/studyScope";

async function generate(mode, { materials, question = "", history = [], signal }) {
  const error = selectionError(materials);
  if (error) throw new APIError(error, "INVALID_INPUT", 400);
  if (mode === "qa" && (!question.trim() || question.length > limits.maxQuestionCharacters)) {
    throw new APIError(`Enter a question between 1 and ${limits.maxQuestionCharacters} characters.`, "INVALID_INPUT", 400);
  }
  return apiRequest(`/ai/${mode}`, {
    method: "POST", signal,
    body: {
      materials: materials.map((material) => ({ id: material.id, name: material.name, content: material.content, readingNotes: material.parseWarning || "", incomplete: materialIsIncomplete(material) })),
      question, history,
    },
  });
}

export const generateAIAnswer = (request) => generate("qa", request);
export const generateAISummary = (request) => generate("summary", request);
export const generateAIQuiz = (request) => generate("quiz", request);
