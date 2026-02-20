const express = require("express");
const router = express.Router();
const Moto = require("../models/Moto");

// 1️⃣ GET /api/marche — tutte le marche disponibili
router.get("/marche", async (req, res) => {
  try {
    const marche = await Moto.distinct("marca");
    res.json({ data: marche });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2️⃣ GET /api/cilindrate — cilindrate (opzionale ?marca=Honda)
router.get("/cilindrate", async (req, res) => {
  try {
    const query = {};
    if (req.query.marca) query.marca = req.query.marca;

    const cilindrate = await Moto.distinct("cilindrata", query);
    res.json({ data: cilindrate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3️⃣ GET /api/modelli — modelli (filtro marca e/o cilindrata)
router.get("/modelli", async (req, res) => {
  try {
    const query = {};
    if (req.query.marca) query.marca = req.query.marca;
    if (req.query.cilindrata) query.cilindrata = Number(req.query.cilindrata);

    const modelli = await Moto.distinct("modello", query);
    res.json({ data: modelli });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4️⃣ GET /api/anni — anni per marca + cilindrata + modello
router.get("/anni", async (req, res) => {
  try {
    const { marca, cilindrata, modello } = req.query;

    const moto = await Moto.findOne(
      { marca, cilindrata: Number(cilindrata), modello },
      { anni: 1, _id: 0 }
    );
    res.json({ data: moto ? moto.anni : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5️⃣ GET /api/filtri — filtro avanzato unico (marche, cilindrate, modelli, anni)
router.get("/filtri", async (req, res) => {
  try {
    const query = {};
    if (req.query.marca) query.marca = req.query.marca;
    if (req.query.cilindrata) query.cilindrata = Number(req.query.cilindrata);
    if (req.query.modello) query.modello = req.query.modello;

    const data = await Moto.find(query);

    const marche = [...new Set(data.map((d) => d.marca))];
    const cilindrate = [...new Set(data.map((d) => d.cilindrata))];
    const modelli = [...new Set(data.map((d) => d.modello))];
    const anni = [...new Set(data.flatMap((d) => d.anni))];

    res.json({ marche, cilindrate, modelli, anni });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6️⃣ GET /api/ricerca — ricerca full text su modello
router.get("/ricerca", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== "string") {
      return res.json({ data: [] });
    }
    const data = await Moto.find({
      modello: { $regex: q, $options: "i" },
    })
      .limit(50)
      .lean();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CRUD ADMIN ====================

// 7️⃣ GET /api/moto — lista moto con paginazione (admin)
router.get("/moto", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = Math.min(parseInt(req.query.per_page, 10) || 25, 100);
    const skip = (page - 1) * perPage;

    const query = {};
    if (req.query.marca) query.marca = req.query.marca;
    if (req.query.search) {
      query.modello = { $regex: req.query.search, $options: "i" };
    }

    const [data, total] = await Promise.all([
      Moto.find(query).sort({ marca: 1, modello: 1 }).skip(skip).limit(perPage).lean(),
      Moto.countDocuments(query),
    ]);

    res.json({
      data,
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

// 8️⃣ GET /api/moto/:id — singola moto
router.get("/moto/:id", async (req, res) => {
  try {
    const moto = await Moto.findById(req.params.id);
    if (!moto) {
      return res.status(404).json({ error: "Moto non trovata" });
    }
    res.json({ data: moto });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9️⃣ POST /api/moto — crea moto
router.post("/moto", async (req, res) => {
  try {
    const { marca, modello, cilindrata, anni, categoria, paese } = req.body;
    
    if (!marca || !modello) {
      return res.status(400).json({ error: "Marca e Modello sono obbligatori" });
    }

    const moto = new Moto({
      marca,
      modello,
      cilindrata: cilindrata || 0,
      anni: anni || [],
      categoria: categoria || "Unknown",
      paese: paese || "Unknown",
    });

    await moto.save();
    res.status(201).json({ data: moto });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔟 PUT /api/moto/:id — aggiorna moto
router.put("/moto/:id", async (req, res) => {
  try {
    const moto = await Moto.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!moto) {
      return res.status(404).json({ error: "Moto non trovata" });
    }
    res.json({ data: moto });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 1️⃣1️⃣ DELETE /api/moto/:id — elimina moto
router.delete("/moto/:id", async (req, res) => {
  try {
    const moto = await Moto.findByIdAndDelete(req.params.id);
    if (!moto) {
      return res.status(404).json({ error: "Moto non trovata" });
    }
    res.json({ success: true, message: "Moto eliminata" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
