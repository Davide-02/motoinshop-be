const express = require("express");
const router = express.Router();
const Product = require("../models/Product");

// GET /api/products — lista prodotti con paginazione e filtri
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = Math.min(parseInt(req.query.per_page, 10) || 25, 100);
    const skip = (page - 1) * perPage;

    // Filtri
    const query = {};
    
    // Solo pubblicati di default
    if (req.query.published !== "all") {
      query.published = true;
    }
    
    // Filtro per categoria
    if (req.query.category) {
      query.categories = { $regex: req.query.category, $options: "i" };
    }
    
    // Filtro per disponibilità
    if (req.query.in_stock === "true") {
      query.inStock = true;
    }
    
    // Filtro per prezzo
    if (req.query.min_price || req.query.max_price) {
      query.price = {};
      if (req.query.min_price) query.price.$gte = parseFloat(req.query.min_price);
      if (req.query.max_price) query.price.$lte = parseFloat(req.query.max_price);
    }

    // Filtro per ricerca testuale
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { shortDescription: { $regex: req.query.search, $options: "i" } },
        { sku: { $regex: req.query.search, $options: "i" } },
      ];
    }

    // Ordinamento
    let sort = { createdAt: -1 };
    if (req.query.sort === "price_asc") sort = { price: 1 };
    else if (req.query.sort === "price_desc") sort = { price: -1 };
    else if (req.query.sort === "name_asc") sort = { name: 1 };
    else if (req.query.sort === "name_desc") sort = { name: -1 };

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(perPage).lean(),
      Product.countDocuments(query),
    ]);

    res.json({
      data: products,
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

// GET /api/products/categories — categorie uniche
router.get("/categories", async (req, res) => {
  try {
    const categories = await Product.distinct("categories");
    // Filtra valori vuoti e ordina
    const filtered = categories.filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({ data: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/search — ricerca full text
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    if (!q) {
      return res.json({ data: [] });
    }

    const products = await Product.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { shortDescription: { $regex: q, $options: "i" } },
        { sku: { $regex: q, $options: "i" } },
      ],
      published: true,
    })
      .limit(limit)
      .lean();

    res.json({ data: products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id — singolo prodotto
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }
    res.json({ data: product });
  } catch (err) {
    // Se l'ID non è un ObjectId valido, prova con wcId
    if (err.name === "CastError") {
      try {
        const product = await Product.findOne({ wcId: parseInt(req.params.id, 10) }).lean();
        if (!product) {
          return res.status(404).json({ error: "Prodotto non trovato" });
        }
        return res.json({ data: product });
      } catch (e) {
        return res.status(404).json({ error: "Prodotto non trovato" });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products — crea prodotto
router.post("/", async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ data: product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/products/:id — aggiorna prodotto
router.put("/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }
    res.json({ data: product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id — elimina prodotto
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }
    res.json({ success: true, message: "Prodotto eliminato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
