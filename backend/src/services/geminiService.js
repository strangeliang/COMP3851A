const { StudyError, validateRequest, buildGeminiRequest, parseOutput } = require("./studyContracts");

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function createGeminiService({ apiKey = process.env.GEMINI_API_KEY || "", model = process.env.GEMINI_MODEL || "gemini-2.5-flash", fetchImpl = fetch, timeoutMs = 90000, delay = abortableDelay } = {}) {
  const configured = Boolean(apiKey.trim()) && !/replace|your[_ -]|example/i.test(apiKey);
  return {
    status: () => ({ configured, provider: "Gemini", model }),
    async generate(mode, input, { signal } = {}) {
      const request = validateRequest(mode, input);
      if (!configured) throw new StudyError(503, "AI_NOT_CONFIGURED", "AI is not configured yet. Please contact the project owner.");
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(buildGeminiRequest(mode, request)),
            signal: controller.signal,
          });
          if (response.ok) return parseOutput(mode, await response.json());
          // Never log or forward provider error bodies, URLs, or keys.
          await response.text();
          if (attempt === 0 && [429, 500, 502, 503, 504].includes(response.status)) {
            const retrySeconds = Number(response.headers?.get("retry-after"));
            await delay(Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.min(retrySeconds * 1000, 3000) : 600, controller.signal);
            continue;
          }
          if (response.status === 429) throw new StudyError(429, "AI_RATE_LIMIT", "The AI service is busy or its quota is exhausted. Please try again later.");
          if ([400, 401, 403, 404].includes(response.status)) throw new StudyError(503, "AI_CONFIGURATION_ERROR", "The AI service configuration needs attention. Please contact the project owner.");
          throw new StudyError(503, "AI_UNAVAILABLE", "The AI service is temporarily unavailable. Please try again later.");
        }
      } catch (error) {
        if (timedOut) throw new StudyError(504, "AI_TIMEOUT", "The AI request timed out. Please try again with fewer materials.");
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        if (error instanceof StudyError) throw error;
        throw new StudyError(503, "AI_UNAVAILABLE", "The AI service could not complete the request. Please try again.");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

module.exports = { createGeminiService };
