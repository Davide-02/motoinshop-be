const express = require("express");
const router = express.Router();
const Warehouse = require("../models/Warehouse");

function toInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

// GET /api/warehouses — lista magazzini (paginazione + ricerca)
router.get("/", async (req, res) => {
  try {
    const page = Math.max(toInt(req.query.page, 1), 1);
    const perPage = Math.min(Math.max(toInt(req.query.per_page, 25), 1), 100);
    const skip = (page - 1) * perPage;

    const query = {};
    const search = String(req.query.search || "").trim();
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { managerName: { $regex: search, $options: "i" } },
      ];
    }

    if (req.query.active === "true") query.active = true;
    if (req.query.active === "false") query.active = false;

    const [items, total] = await Promise.all([
      Warehouse.find(query).sort({ name: 1 }).skip(skip).limit(perPage).lean(),
      Warehouse.countDocuments(query),
    ]);

    res.json({
      data: items,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/warehouses/:id — singolo magazzino
router.get("/:id", async (req, res) => {
  try {
    const item = await Warehouse.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Magazzino non trovato" });
    res.json({ data: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/warehouses — crea magazzino
router.post("/", async (req, res) => {
  try {
    if (!req.body || !String(req.body.name || "").trim()) {
      return res.status(400).json({ error: "Il nome è obbligatorio" });
    }
    const code = String(req.body.code || "").trim();
    if (code) {
      const existing = await Warehouse.findOne({ code: new RegExp("^" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }).lean();
      if (existing) {
        return res.status(409).json({ error: "Codice magazzino già esistente" });
      }
    }
    const item = new Warehouse(req.body);
    await item.save();
    res.status(201).json({ data: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/warehouses/:id — aggiorna magazzino
router.put("/:id", async (req, res) => {
  try {
    if (req.body && typeof req.body.code === "string") {
      const code = req.body.code.trim();
      if (code) {
        const existing = await Warehouse.findOne({
          _id: { $ne: req.params.id },
          code: new RegExp("^" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
        }).lean();
        if (existing) {
          return res.status(409).json({ error: "Codice magazzino già esistente" });
        }
      }
    }

    const item = await Warehouse.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ error: "Magazzino non trovato" });
    res.json({ data: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/warehouses/:id — elimina magazzino
router.delete("/:id", async (req, res) => {
  try {
    const item = await Warehouse.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: "Magazzino non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

