const express = require("express");
const router = express.Router();
const Setting = require("../models/Setting");
const authRouter = require("./auth");

// GET /api/settings/maintenance — stato manutenzione (pubblico, per middleware frontend)
router.get("/maintenance", async (req, res) => {
  try {
    const doc = await Setting.findOne({ key: "maintenance" }).lean();
    const enabled = doc?.value === true;
    res.json({ enabled: !!enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings/maintenance — attiva/disattiva manutenzione (solo admin)
router.patch(
  "/maintenance",
  authRouter.authMiddleware,
  authRouter.adminMiddleware,
  async (req, res) => {
    try {
      const enabled = req.body.enabled === true;
      await Setting.findOneAndUpdate(
        { key: "maintenance" },
        { $set: { key: "maintenance", value: enabled } },
        { upsert: true, new: true },
      );
      res.json({ enabled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

module.exports = router;
