require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { createApp } = require("./app");
const { validateRuntime } = require('./config/runtime');

const PORT = Number(process.env.PORT) || 8000;

async function startServer() {
  try {
    validateRuntime();
    // Validate before opening SQLite: a missing mount must not silently create a
    // second, empty database in the application directory.
    const database = require("./config/database");
    await database.initializeDatabase();
    const app = createApp({ database });

    app.listen(PORT, process.env.HOST || "127.0.0.1", () => {
      console.log(`Backend server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start the backend:", error.message);

    process.exit(1);
  }
}

startServer();
