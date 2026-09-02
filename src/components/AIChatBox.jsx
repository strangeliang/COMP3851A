import { useRef } from "react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import { ChatContainer, MainContainer, Message, MessageInput, MessageList, TypingIndicator } from "@chatscope/chat-ui-kit-react";
import { CheckCircle2, FileText, Sparkles, UploadCloud } from "lucide-react";
import { generateAIAnswer } from "../services/aiService";
import { useAppData } from "../state/AppDataContext";
import useAIRequest from "../hooks/useAIRequest";
import { limits, recentHistory, selectionError } from "../utils/studyScope";

export default function AIChatBox({ selectedMaterials = [], currentCourse = null }) {
  const { addChatRecord, recordQAUse, currentChatRecords, scope, aiStatus, notify } = useAppData();
  const request = useAIRequest(scope.scopeKey);
  const sendLock = useRef(null);
  const isTyping = request.pending;
  const materialNames = selectedMaterials.map((material) => material.name).join(", ");
  const inputError = selectionError(selectedMaterials);
  const answerMode = currentChatRecords.some((record) => record.role === "AI" && record.mode === "api") ? "api" : "";
  const messages = currentChatRecords.length ? currentChatRecords.map((record) => ({
    id: record.id, message: record.mode !== "api" && record.role === "AI" ? `[Earlier saved answer; source not verified] ${record.text}` : record.text,
    sender: record.role === "User" ? "Student" : "AI", direction: record.role === "User" ? "outgoing" : "incoming", type: "text",
  })) : [{ id: "welcome", type: "text", sender: "AI", direction: "incoming",
    message: selectedMaterials.length ? `Selected materials: ${materialNames}. Ask a question about these sources.` : "Select at least one course material first." }];

  async function handleSend(_html, textContent) {
    const question = typeof textContent === "string" ? textContent.trim() : "";
    if (!question || sendLock.current?.scopeKey === scope.scopeKey) return;
    if (inputError || !aiStatus.configured) { notify(inputError || aiStatus.message); return; }
    if (question.length > limits.maxQuestionCharacters) { notify(`Keep your question within ${limits.maxQuestionCharacters.toLocaleString()} characters.`); return; }
    const token = { scopeKey: scope.scopeKey };
    sendLock.current = token;
    const capturedScope = scope;
    const history = recentHistory(currentChatRecords);
    addChatRecord("User", question, { scope: capturedScope, mode: "api" });
    recordQAUse(capturedScope);
    try {
      const result = await request.run((signal) => generateAIAnswer({ materials: selectedMaterials, question, history, signal }));
      if (result) addChatRecord("AI", result.answer, { scope: capturedScope, mode: "api" });
    } finally { if (sendLock.current === token) sendLock.current = null; }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", height: "100%" }}>
      <style>{`
        .cs-message__content {
          border-radius: 20px !important;
          padding: 12px 18px !important;
          font-size: 14.5px !important;
          line-height: 1.5 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
        }
        .cs-message--incoming .cs-message__content {
          border-bottom-left-radius: 4px !important;
          background-color: #f3f4f6 !important;
          color: #1f2937 !important;
        }
        .cs-message--outgoing .cs-message__content {
          border-bottom-right-radius: 4px !important;
          background-color: #6366f1 !important;
          color: #ffffff !important;
        }
        .cs-message-input {
          border-radius: 24px !important;
          background-color: #f9fafb !important;
          border: 1px solid #e5e7eb !important;
          margin: 12px !important;
        }
        .cs-message-input__content-wrapper {
          border-radius: 24px !important;
        }
      `}</style>

      <div
        style={{
          padding: "28px 24px",
          backgroundColor: selectedMaterials.length ? "#f0fdf4" : "#ffffff",
          border: selectedMaterials.length ? "1px solid #bbf7d0" : "1px dashed #d1d5db",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          transition: "all 0.3s ease",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
      >
        {selectedMaterials.length ? (
          <>
            <CheckCircle2 size={36} color="#22c55e" />
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 4px 0", fontWeight: 600, color: "#166534", fontSize: "16px" }}>
                Selected source materials
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#15803d",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                <FileText size={14} /> {materialNames}
              </p>
              {currentCourse && (
                <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                  Course scope: {currentCourse.code} {currentCourse.name}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: "12px", backgroundColor: "#f3f4f6", borderRadius: "50%" }}>
              <UploadCloud size={28} color="#6366f1" />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: "#111827", fontSize: "16px" }}>
                Select Source Material
              </p>
              <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
                Q&A can read text from TXT, MD, PDF, DOCX, PPTX, and image materials in the selected course.
              </p>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Sparkles size={18} color="#6366f1" />
          <span style={{ fontWeight: 600, color: "#111827", fontSize: "15px" }}>Study Companion AI</span>
          {answerMode && (
            <span
              style={{
                marginLeft: "8px",
                padding: "4px 8px",
                borderRadius: "999px",
                backgroundColor: "#dcfce7",
                color: "#166534",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Gemini API
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: aiStatus.configured ? "#6366f1" : "#9ca3af" }} />
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>{isTyping ? "Reading…" : request.status === "error" ? "Request failed" : aiStatus.loading ? "Checking…" : aiStatus.configured ? "Configured" : "Unavailable"}</span>
          </div>
        </div>

        {(inputError || !aiStatus.configured) && <p className="state-banner" role="status">{inputError || aiStatus.message}</p>}
        {request.error && <p className="state-banner error" role="alert">{request.error} You can send the question again.</p>}
        {isTyping && <button type="button" onClick={request.cancel}>Stop generating</button>}
        <div style={{ height: "450px", position: "relative" }}>
          <MainContainer style={{ border: "none", height: "100%" }}>
            <ChatContainer>
              <MessageList
                typingIndicator={isTyping ? <TypingIndicator content="AI is reading..." /> : null}
                style={{ backgroundColor: "#ffffff", padding: "16px" }}
              >
                {messages.map((message, index) => (
                  <Message key={message.id || index} model={message} type="text" />
                ))}
              </MessageList>
              <MessageInput
                placeholder="Ask a question about your selected material..."
                onSend={handleSend}
                attachButton={false}
                disabled={Boolean(inputError) || !aiStatus.configured || isTyping}
              />
            </ChatContainer>
          </MainContainer>
        </div>
      </div>
    </div>
  );
}
