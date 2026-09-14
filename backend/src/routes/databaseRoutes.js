const express = require("express");

const { getDatabaseStatus } = require("../config/database");

const router = express.Router();

router.get("/status", async (req, res) => {
  try {
    const databaseStatus = await getDatabaseStatus();
    res.status(200).json(databaseStatus);
  } catch (error) {
    res.status(503).json({
      status: "error",
      database: "unavailable",
      message: error.message,
    });
  }
});

module.exports = router;
