const express = require("express");
const router = express.Router();
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const UnitaMisura = require("../models/UnitaMisura");

// ========== CATEGORIES ==========
// GET /api/catalog/categories
router.get("/categories", async (req, res) => {
  try {
    const list = await Category.find().sort({ name: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog/categories
router.post("/categories", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obbligatorio" });
    const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${()|[\]\\]/g, "\\$&")}$`, "i") } });
    if (existing) return res.status(400).json({ error: "Categoria già presente" });
    const doc = await Category.create({ name });
    res.status(201).json({ data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Categoria già presente" });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/catalog/categories/:id
router.put("/categories/:id", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obbligatorio" });
    const doc = await Category.findByIdAndUpdate(req.params.id, { name }, { new: true, runValidators: true }).lean();
    if (!doc) return res.status(404).json({ error: "Categoria non trovata" });
    res.json({ data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Categoria già presente" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/catalog/categories/:id
router.delete("/categories/:id", async (req, res) => {
  try {
    const doc = await Category.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Categoria non trovata" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SUBCATEGORIES ==========
// GET /api/catalog/subcategories
router.get("/subcategories", async (req, res) => {
  try {
    const list = await Subcategory.find().sort({ name: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog/subcategories
router.post("/subcategories", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obbligatorio" });
    const existing = await Subcategory.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${()|[\]\\]/g, "\\$&")}$`, "i") } });
    if (existing) return res.status(400).json({ error: "Sottocategoria già presente" });
    const doc = await Subcategory.create({ name });
    res.status(201).json({ data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Sottocategoria già presente" });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/catalog/subcategories/:id
router.put("/subcategories/:id", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obbligatorio" });
    const doc = await Subcategory.findByIdAndUpdate(req.params.id, { name }, { new: true, runValidators: true }).lean();
    if (!doc) return res.status(404).json({ error: "Sottocategoria non trovata" });
    res.json({ data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Sottocategoria già presente" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/catalog/subcategories/:id
router.delete("/subcategories/:id", async (req, res) => {
  try {
    const doc = await Subcategory.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Sottocategoria non trovata" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== UNITÀ DI MISURA ==========
// GET /api/catalog/units
router.get("/units", async (req, res) => {
  try {
    const list = await UnitaMisura.find().sort({ name: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog/units
router.post("/units", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obbligatorio" });
    const existing = await UnitaMisura.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${()|[\]\\]/g, "\\$&")}$`, "i") } });
    if (existing) return res.status(400).json({ error: "Unità di misura già presente" });
    const doc = await UnitaMisura.create({ name });
    res.status(201).json({ data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Unità di misura già presente" });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/catalog/units/:id
router.put("/units/:id", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obbligatorio" });
    const doc = await UnitaMisura.findByIdAndUpdate(req.params.id, { name }, { new: true, runValidators: true }).lean();
    if (!doc) return res.status(404).json({ error: "Unità di misura non trovata" });
    res.json({ data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Unità di misura già presente" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/catalog/units/:id
router.delete("/units/:id", async (req, res) => {
  try {
    const doc = await UnitaMisura.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Unità di misura non trovata" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
