import { mockAnswers } from "../data/mockData";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const BROWSER_KEY_STORAGE = "study-companion-gemini-key";
const MAX_MATERIAL_CONTEXT_CHARACTERS = 14_000;

function getApiKey() {
  return import.meta.env.VITE_GEMINI_API_KEY || window.localStorage.getItem(BROWSER_KEY_STORAGE) || "";
}

function buildMaterialContext(materials) {
  if (!materials.length) {
    return "No source material selected.";
  }

  const perMaterialBudget = Math.max(
    1_000,
    Math.floor((MAX_MATERIAL_CONTEXT_CHARACTERS - 1_000) / materials.length),
  );

  return materials
    .map((material, index) => {
      const body = material.content || "No readable text content is available for this material yet.";
      const clippedBody = body.slice(0, perMaterialBudget);
      const truncationNote =
        body.length > perMaterialBudget ? "\n[Source text truncated for request size]" : "";
      return `Source ${index + 1}: ${material.name}\n${clippedBody}${truncationNote}`;
    })
    .join("\n\n---\n\n")
    .slice(0, MAX_MATERIAL_CONTEXT_CHARACTERS);
}

function buildPrompt({ materials, question }) {
  return `You are Study Companion AI. Answer the student's question using only the selected source material. If the answer cannot be found in the material, say that clearly and suggest what information is missing.\n\nSelected source material:\n${buildMaterialContext(materials)}\n\nStudent question:\n${question}`;
}

function mockFallbackAnswer({ materials, question, fallbackIndex = 0 }) {
  const materialNames = materials.map((item) => item.name).join(", ") || "selected Source File";
  const baseAnswer = mockAnswers[fallbackIndex % mockAnswers.length];
  return `${baseAnswer} This response is based on the current selected material scope: ${materialNames}. Question received: "${question}"`;
}

export async function generateAIAnswer({ materials, question, fallbackIndex = 0 }) {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      answer: mockFallbackAnswer({ materials, question, fallbackIndex }),
      mode: "mock",
    };
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt({ materials, question }) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Gemini API request failed with status ${response.status}`);
  }

  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim();

  if (!answer) {
    throw new Error("Gemini API returned an empty answer.");
  }

  return { answer, mode: "api" };
}
