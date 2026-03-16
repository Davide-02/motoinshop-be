const express = require("express");
const router = express.Router();
const Supplier = require("../models/Supplier");

// GET /api/suppliers - lista fornitori
router.get("/", async (req, res) => {
  try {
    const list = await Supplier.find().sort({ name: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/suppliers - crea fornitore
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const name = (body.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Nome (ragione sociale) obbligatorio" });
    }
    const supplier = await Supplier.create(body);
    res.status(201).json({ data: supplier });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

