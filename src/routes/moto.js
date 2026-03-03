const express = require("express");
const router = express.Router();
const Moto = require("../models/Moto");

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function regexCaseInsensitive(val) {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return new RegExp("^" + escapeRegex(trimmed) + "$", "i");
}
// Normalizza per confronto:
// - minuscolo
// - tratta - _ / come spazi
// - rimuove spazi multipli
// - ordina le parole alfabeticamente
// In questo modo "cbr 600", "600 cbr" e "cbr-600" vengono considerati uguali.
function normalizeForMatch(s) {
  const trimmed = String(s || "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .trim();
  if (!trimmed) return "";
  const tokens = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return tokens.join("");
}
function normalizedKey(marca, modello) {
  return normalizeForMatch(marca) + "|" + normalizeForMatch(modello);
}
// Regex per ricerca: term con spazi opzionali ovunque (es. "s1000rr" trova "s 1000 rr")
function searchRegexWithOptionalSpaces(term) {
  const s = String(term || "").trim();
  if (!s) return null;
  const pattern = s.split("").map((c) => escapeRegex(c)).join("\\s*");
  return new RegExp(pattern, "i");
}

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
    const mar = regexCaseInsensitive(req.query.marca);
    if (mar) query.marca = mar;

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
    const mar = regexCaseInsensitive(req.query.marca);
    if (mar) query.marca = mar;
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
    const query = {};
    const mar = regexCaseInsensitive(marca);
    const mod = regexCaseInsensitive(modello);
    if (mar) query.marca = mar;
    if (mod) query.modello = mod;
    if (cilindrata != null && cilindrata !== "") query.cilindrata = Number(cilindrata);

    const moto = await Moto.findOne(query, { anni: 1, _id: 0 });
    res.json({ data: moto ? moto.anni : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5️⃣ GET /api/filtri — filtro avanzato unico (marche, cilindrate, modelli, anni)
router.get("/filtri", async (req, res) => {
  try {
    const query = {};
    const mar = regexCaseInsensitive(req.query.marca);
    const mod = regexCaseInsensitive(req.query.modello);
    if (mar) query.marca = mar;
    if (mod) query.modello = mod;
    if (req.query.cilindrata != null && req.query.cilindrata !== "") query.cilindrata = Number(req.query.cilindrata);

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
    if (req.query.cilindrata != null && req.query.cilindrata !== "")
      query.cilindrata = Number(req.query.cilindrata);
    if (req.query.categoria) query.categoria = req.query.categoria;
    if (req.query.search) {
      const q = req.query.search.trim();
      if (q) {
        const searchRe = searchRegexWithOptionalSpaces(q);
        if (searchRe) {
          query.$or = [
            { marca: searchRe },
            { modello: searchRe },
          ];
        }
      }
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

// Helper per fuzzy-match del modello: confronta le parole ignorando ordine,
// trattando - _ / come spazi e richiedendo che la maggior parte delle parole
// del modello "input" siano presenti in quello esistente.
function modelTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
function isFuzzyModelMatch(existingModel, inputModel) {
  const inTokens = modelTokens(inputModel);
  if (inTokens.length === 0) return false;
  const exTokens = new Set(modelTokens(existingModel));
  let matched = 0;
  for (const t of inTokens) {
    if (exTokens.has(t)) matched++;
  }
  const ratio = matched / inTokens.length;
  // Consideriamo "uguali" se tutte (o quasi tutte) le parole dell'input
  // sono contenute nel modello esistente (es. "desmosedici" ⊆ "desmosedici rr e3").
  return matched > 0 && (ratio >= 0.8 || inTokens.length === 1);
}

// 9b POST /api/moto/check-missing — quali (marca, modello) non esistono in DB
router.post("/moto/check-missing", async (req, res) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ missing: [] });
    }
    const allPairs = await Moto.find({}, { marca: 1, modello: 1 }).lean();
    const existingKeys = new Set(allPairs.map((d) => normalizedKey(d.marca, d.modello)));
    // Raggruppa per marca normalizzata per rendere il fuzzy-match più veloce
    const byMarca = new Map();
    for (const d of allPairs) {
      const key = normalizeForMatch(d.marca);
      if (!byMarca.has(key)) byMarca.set(key, []);
      byMarca.get(key).push(d.modello || "");
    }
    const missing = [];
    for (const item of items) {
      const marca = item.marca && String(item.marca).trim();
      const modello = item.modello && String(item.modello).trim();
      if (!marca || !modello) continue;
      const key = normalizedKey(marca, modello);
      // 1) Match "esatto" con normalizzazione forte (ordine parole, spazi, ecc.)
      if (existingKeys.has(key)) continue;
      // 2) Fuzzy-match per stessa marca: se esiste almeno un modello
      // che contiene (quasi) tutte le parole del modello inserito, NON è mancante.
      const marcaNorm = normalizeForMatch(marca);
      const modelsForBrand = byMarca.get(marcaNorm) || [];
      const fuzzyFound = modelsForBrand.some((m) => isFuzzyModelMatch(m, modello));
      if (fuzzyFound) continue;
      missing.push({ marca, modello });
    }
    res.json({ missing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9c POST /api/moto/bulk-create — crea in blocco moto mancanti (solo se non esistono; confronto normalizzato come check-missing)
router.post("/moto/bulk-create", async (req, res) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ created: 0 });
    }
    const allPairs = await Moto.find({}, { marca: 1, modello: 1 }).lean();
    const existingKeys = new Set(allPairs.map((d) => normalizedKey(d.marca, d.modello)));
    let created = 0;
    for (const item of items) {
      const marca = item.marca && String(item.marca).trim();
      const modello = item.modello && String(item.modello).trim();
      if (!marca || !modello) continue;
      const key = normalizedKey(marca, modello);
      if (existingKeys.has(key)) continue;
      const anni = Array.isArray(item.anni) ? item.anni : [];
      const moto = new Moto({
        marca,
        modello,
        cilindrata: 0,
        anni,
        categoria: "Unknown",
        paese: "Unknown",
      });
      await moto.save();
      existingKeys.add(key);
      created++;
    }
    res.json({ created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9d POST /api/moto/import — import da CSV/array (evita duplicati: confronto normalizzato marca+modello)
router.post("/moto/import", async (req, res) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ created: 0, skipped: 0 });
    }
    const allPairs = await Moto.find({}, { marca: 1, modello: 1 }).lean();
    const existingKeys = new Set(allPairs.map((d) => normalizedKey(d.marca, d.modello)));
    let created = 0;
    let skipped = 0;
    for (const item of items) {
      const marca = item.marca && String(item.marca).trim();
      const modello = item.modello && String(item.modello).trim();
      if (!marca || !modello) continue;
      const key = normalizedKey(marca, modello);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      const cilindrata = Number(item.cilindrata) || 0;
      const anni = Array.isArray(item.anni) ? item.anni : [];
      const categoria = (item.categoria && String(item.categoria).trim()) || "Unknown";
      const paese = (item.paese && String(item.paese).trim()) || "Unknown";
      const moto = new Moto({
        marca,
        modello,
        cilindrata,
        anni,
        categoria,
        paese,
      });
      await moto.save();
      existingKeys.add(key);
      created++;
    }
    res.json({ created, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
