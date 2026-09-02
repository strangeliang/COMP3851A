const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const healthRoutes = require("./routes/healthRoutes");
const { createStudyRoutes } = require("./routes/studyRoutes");
const { createGeminiService } = require("./services/geminiService");
const { StudyError } = require("./services/studyContracts");

function createApp({ database, gemini = createGeminiService(), sessions } = {}) {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
  app.disable("x-powered-by");
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin && origin !== frontendOrigin && origin !== `${req.protocol}://${req.get("host")}`) {
      return next(new StudyError(403, "INVALID_ORIGIN", "This request origin is not allowed."));
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/health", healthRoutes);
  app.get("/api/database/status", async (req, res) => res.json(await database.getDatabaseStatus()));
  app.use("/api", createStudyRoutes({ database, gemini, sessions }));
  app.use("/api", (req, res) => res.status(404).json({ code: "NOT_FOUND", message: "This API endpoint does not exist." }));

  const dist = path.join(__dirname, "../../dist");
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html")) return res.sendFile(path.join(dist, "index.html"));
      next();
    });
  }
  app.use((error, req, res, _next) => {
    if (res.headersSent || res.destroyed || error.name === "AbortError") return;
    const oversized = error.type === "entity.too.large";
    const malformed = error.type === "entity.parse.failed";
    const status = error instanceof StudyError ? error.status : oversized ? 413 : malformed ? 400 : 500;
    res.status(status).json({
      code: error instanceof StudyError ? error.code : oversized ? "REQUEST_TOO_LARGE" : malformed ? "INVALID_JSON" : "SERVER_ERROR",
      message: error instanceof StudyError ? error.message : oversized ? "This request is too large." : malformed ? "The request body is invalid." : "The service could not complete the request. Please try again.",
    });
  });
  return app;
}

module.exports = { createApp };
