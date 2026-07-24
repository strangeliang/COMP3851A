import React, { useEffect, useMemo, useState } from "react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import {
  ChatContainer,
  MainContainer,
  Message,
  MessageInput,
  MessageList,
  TypingIndicator,
} from "@chatscope/chat-ui-kit-react";
import { CheckCircle2, FileText, Sparkles, UploadCloud } from "lucide-react";
import { generateAIAnswer } from "../services/aiService";
import { useAppData } from "../state/AppDataContext";

export default function AIChatBox({ selectedMaterials = [], currentCourse = null }) {
  const { addChatRecord, recordQAUse } = useAppData();
  const [isTyping, setIsTyping] = useState(false);
  const [answerMode, setAnswerMode] = useState("");
  const materialKey = selectedMaterials.map((material) => material.id).join("|");
  const materialNames = selectedMaterials.map((material) => material.name).join(", ");
  const hasReadableMaterials = selectedMaterials.some((material) => material.content?.trim());

  const initialMessage = useMemo(
    () => ({
      message: selectedMaterials.length
        ? `Selected material loaded: ${materialNames}. Ask a question based on this source scope.`
        : "Select at least one course material first, then ask me anything about it.",
      sender: "AI",
      direction: "incoming",
    }),
    [materialNames, selectedMaterials.length],
  );

  const [messages, setMessages] = useState([initialMessage]);

  useEffect(() => {
    setMessages([initialMessage]);
    setAnswerMode("");
  }, [initialMessage, materialKey]);

  async function handleSend(userMessage) {
    const question = userMessage.trim();
    if (!question) return;

    if (!selectedMaterials.length) {
      setMessages((current) => [
        ...current,
        {
          message: "Please select at least one Source File before asking a question.",
          sender: "AI",
          direction: "incoming",
        },
      ]);
      return;
    }

    if (!hasReadableMaterials) {
      setMessages((current) => [
        ...current,
        {
          message:
            "The selected material does not have readable text content yet. Please upload TXT, MD, PDF, DOCX, PPTX, or an image that contains readable text.",
          sender: "AI",
          direction: "incoming",
        },
      ]);
      return;
    }

    setMessages((current) => [
      ...current,
      { message: question, sender: "Student", direction: "outgoing" },
    ]);
    addChatRecord("User", question);
    recordQAUse();
    setIsTyping(true);

    try {
      const result = await generateAIAnswer({
        materials: selectedMaterials,
        question,
        fallbackIndex: messages.length,
      });

      setAnswerMode(result.mode);
      setMessages((current) => [
        ...current,
        { message: result.answer, sender: "AI", direction: "incoming" },
      ]);
      addChatRecord("AI", result.answer);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sorry, the AI service could not answer right now.";

      setMessages((current) => [
        ...current,
        {
          message: `AI request failed. Please check the Gemini API key or try again later. Details: ${message}`,
          sender: "AI",
          direction: "incoming",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
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
                Material Loaded Successfully
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
                backgroundColor: answerMode === "api" ? "#dcfce7" : "#ffedd5",
                color: answerMode === "api" ? "#166534" : "#9a3412",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              {answerMode === "api" ? "Gemini API" : "Mock Fallback"}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#22c55e" }} />
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>Online</span>
          </div>
        </div>

        <div style={{ height: "450px", position: "relative" }}>
          <MainContainer style={{ border: "none", height: "100%" }}>
            <ChatContainer>
              <MessageList
                typingIndicator={isTyping ? <TypingIndicator content="AI is reading..." /> : null}
                style={{ backgroundColor: "#ffffff", padding: "16px" }}
              >
                {messages.map((message, index) => (
                  <Message key={`${message.sender}-${index}`} model={message} />
                ))}
              </MessageList>
              <MessageInput
                placeholder="Ask a question about your selected material..."
                onSend={handleSend}
                attachButton={false}
                disabled={!selectedMaterials.length || isTyping}
              />
            </ChatContainer>
          </MainContainer>
        </div>
      </div>
    </div>
  );
}
