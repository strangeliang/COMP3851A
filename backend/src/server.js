require("dotenv").config();

const app = require("./app");
const { initializeDatabase } = require("./config/database");

const PORT = Number(process.env.PORT) || 8000;

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Backend server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start the backend:", error.message);

    process.exit(1);
  }
}

startServer();
