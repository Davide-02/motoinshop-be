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

module.exports = router;
