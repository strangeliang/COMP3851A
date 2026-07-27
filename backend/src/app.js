const express = require("express");
const cors = require("cors");

const databaseRoutes = require("./routes/databaseRoutes");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/database", databaseRoutes);

module.exports = app;
