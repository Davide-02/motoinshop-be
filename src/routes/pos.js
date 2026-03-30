const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Counter = require("../models/Counter");

const JWT_SECRET = process.env.JWT_SECRET || "motoin_secret_key_change_in_production";

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token mancante" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Utente non trovato o disattivato" });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token scaduto", expired: true });
    }
    return res.status(401).json({ error: "Token non valido" });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  next();
}

// GET /api/pos/next-number — prossimo numero banco (calcolato da DB, non da FE)
router.get("/next-number", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const c = await Counter.findOne({ key: "saleNumber" }).lean();
    const next = (c?.seq || 0) + 1;
    res.json({ nextNumber: next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pos/sales — registro vendite
router.get("/sales", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = "50", page = "1" } = req.query;
    const lim = Math.min(200, Math.max(1, Number(limit) || 50));
    const pg = Math.max(1, Number(page) || 1);
    const skip = (pg - 1) * lim;

    const [items, total] = await Promise.all([
      Sale.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      Sale.countDocuments({}),
    ]);

    res.json({
      data: items,
      pagination: {
        page: pg,
        limit: lim,
        total,
        pages: Math.ceil(total / lim),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pos/sales/:id — singola vendita
router.get("/sales/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).lean();
    if (!sale) return res.status(404).json({ error: "Vendita non trovata" });
    res.json({ data: sale });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/pos/sales/:id — modifica completa vendita (items + totali + delta giacenze)
router.put("/sales/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, discountPct, openedAt, priceType, items } = req.body || {};

    const sale = await Sale.findById(id);
    if (!sale) return res.status(404).json({ error: "Vendita non trovata" });

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Nessun prodotto nella vendita" });
    }

    const parsed = items.map((it, idx) => {
      const productId = String(it?.productId || "").trim();
      const qty = Number(it?.qty);
      const unitPrice = Number(it?.unitPrice);
      const unitPurchasePrice = Number(it?.unitPurchasePrice);
      if (!productId) throw new Error(`items[${idx}].productId mancante`);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`items[${idx}].qty non valido`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`items[${idx}].unitPrice non valido`);
      if (!Number.isFinite(unitPurchasePrice) || unitPurchasePrice < 0) throw new Error(`items[${idx}].unitPurchasePrice non valido`);
      return { productId, qty, unitPrice, unitPurchasePrice };
    });

    const oldQtyByProductId = new Map();
    for (const it of sale.items || []) {
      const pid = String(it.productId);
      oldQtyByProductId.set(pid, (oldQtyByProductId.get(pid) || 0) + (Number(it.qty) || 0));
    }

    const newQtyByProductId = new Map();
    for (const it of parsed) {
      newQtyByProductId.set(it.productId, (newQtyByProductId.get(it.productId) || 0) + it.qty);
    }

    const allProductIds = Array.from(
      new Set([...oldQtyByProductId.keys(), ...newQtyByProductId.keys()])
    );
    const productDocs = await Product.find({ _id: { $in: allProductIds } });
    const productsById = new Map(productDocs.map((p) => [String(p._id), p]));

    for (const pid of allProductIds) {
      if (!productsById.has(pid)) {
        return res.status(404).json({ error: `Prodotto non trovato: ${pid}` });
      }
    }

    const warnings = [];
    const newDeductedByProductId = new Map();
    for (const pid of allProductIds) {
      const p = productsById.get(pid);
      const oldQty = oldQtyByProductId.get(pid) || 0;
      const newQty = newQtyByProductId.get(pid) || 0;
      const delta = newQty - oldQty;
      const oldDeducted = Array.isArray(sale.items)
        ? sale.items
            .filter((it) => String(it.productId) === pid)
            .reduce(
              (s, it) =>
                s +
                (Number.isFinite(Number(it.stockDeductedQty))
                  ? Number(it.stockDeductedQty)
                  : Number(it.qty) || 0),
              0
            )
        : 0;

      if (delta === 0) {
        newDeductedByProductId.set(pid, oldDeducted);
        continue;
      }

      const currentStock = typeof p.stock === "number" ? p.stock : 0;
      if (delta > 0) {
        const canDeduct = Math.min(currentStock, delta);
        if (canDeduct < delta) {
          warnings.push({
            productId: String(p._id),
            name: p.name || p.sku || String(p._id),
            stockBefore: currentStock,
            qtyRequested: delta,
            stockAfter: 0,
          });
        }
        p.stock = Math.max(0, currentStock - canDeduct);
        if (typeof p.giacenza === "number") p.giacenza = Math.max(0, p.giacenza - canDeduct);
        if (typeof p.disponibili === "number") p.disponibili = Math.max(0, p.disponibili - canDeduct);
        newDeductedByProductId.set(pid, oldDeducted + canDeduct);
      } else {
        const dec = Math.abs(delta);
        const toRestore = Math.min(oldDeducted, dec);
        p.stock = currentStock + toRestore;
        if (typeof p.giacenza === "number") p.giacenza = p.giacenza + toRestore;
        if (typeof p.disponibili === "number") p.disponibili = p.disponibili + toRestore;
        newDeductedByProductId.set(pid, Math.max(0, oldDeducted - toRestore));
      }

      p.inStock = p.stock > 0;
      await p.save();
    }

    if (notes !== undefined) sale.notes = String(notes || "");
    if (openedAt !== undefined) sale.openedAt = openedAt ? new Date(openedAt) : undefined;

    const d = Number(discountPct);
    const dPct = Number.isFinite(d) ? Math.min(100, Math.max(0, d)) : 0;
    sale.discountPct = dPct;
    const remainingDeductedByProductId = new Map(newDeductedByProductId);
    sale.items = parsed.map((it) => {
      const p = productsById.get(it.productId);
      const left = remainingDeductedByProductId.get(it.productId) || 0;
      const lineDeducted = Math.min(left, it.qty);
      remainingDeductedByProductId.set(it.productId, Math.max(0, left - lineDeducted));
      return {
        productId: p._id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        qty: it.qty,
        stockDeductedQty: lineDeducted,
        unitPrice: it.unitPrice,
        unitPurchasePrice: it.unitPurchasePrice,
        priceType: String(priceType || ""),
      };
    });

    const subtotal = parsed.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const totalPurchase = parsed.reduce((s, it) => s + it.unitPurchasePrice * it.qty, 0);
    const total = subtotal * (1 - dPct / 100);
    const profit = total - totalPurchase;
    sale.subtotal = subtotal;
    sale.totalPurchase = totalPurchase;
    sale.total = total;
    sale.profit = profit;

    await sale.save();
    res.json({ data: sale.toObject ? sale.toObject() : sale, warnings });
  } catch (err) {
    res.status(400).json({ error: err.message || "Errore modifica vendita" });
  }
});

// DELETE /api/pos/sales/:id — elimina vendita e ripristina giacenze
router.delete("/sales/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findById(id);
    if (!sale) return res.status(404).json({ error: "Vendita non trovata" });

    const qtyByProductId = new Map();
    for (const it of sale.items || []) {
      const pid = String(it.productId);
      const deducted = Number.isFinite(Number(it.stockDeductedQty))
        ? Number(it.stockDeductedQty)
        : Number(it.qty) || 0;
      qtyByProductId.set(pid, (qtyByProductId.get(pid) || 0) + deducted);
    }

    const productIds = Array.from(qtyByProductId.keys());
    const productDocs = await Product.find({ _id: { $in: productIds } });
    const productsById = new Map(productDocs.map((p) => [String(p._id), p]));

    for (const [pid, qty] of qtyByProductId.entries()) {
      const p = productsById.get(pid);
      if (!p) continue;
      const currentStock = typeof p.stock === "number" ? p.stock : 0;
      p.stock = currentStock + qty;
      if (typeof p.giacenza === "number") p.giacenza = p.giacenza + qty;
      if (typeof p.disponibili === "number") p.disponibili = p.disponibili + qty;
      p.inStock = p.stock > 0;
      await p.save();
    }

    await Sale.deleteOne({ _id: sale._id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Errore eliminazione vendita" });
  }
});

// POST /api/pos/sales — conferma vendita banco (scala giacenze + registra vendita)
router.post("/sales", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { items, priceType, notes, openedAt, discountPct } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Nessun prodotto nella vendita" });
    }

    // Validazione base
    const parsed = items.map((it, idx) => {
      const productId = String(it?.productId || "").trim();
      const qty = Number(it?.qty);
      const unitPrice = Number(it?.unitPrice);
      const unitPurchasePrice = Number(it?.unitPurchasePrice);
      if (!productId) throw new Error(`items[${idx}].productId mancante`);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`items[${idx}].qty non valido`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`items[${idx}].unitPrice non valido`);
      if (!Number.isFinite(unitPurchasePrice) || unitPurchasePrice < 0) throw new Error(`items[${idx}].unitPurchasePrice non valido`);
      return { productId, qty, unitPrice, unitPurchasePrice };
    });

    // Carica prodotti (non blocchiamo se stock insufficiente: si scala fino a 0)
    const productsById = new Map();
    const productDocs = await Product.find({ _id: { $in: parsed.map((p) => p.productId) } });
    productDocs.forEach((p) => productsById.set(String(p._id), p));
    for (const it of parsed) {
      const p = productsById.get(it.productId);
      if (!p) return res.status(404).json({ error: `Prodotto non trovato: ${it.productId}` });
    }

    const warnings = [];
    const stockDeductedByProductId = new Map();
    // Scala giacenze (stock + giacenza + disponibili quando presenti), mai sotto 0
    for (const it of parsed) {
      const p = productsById.get(it.productId);
      const currentStock = typeof p.stock === "number" ? p.stock : 0;
      const deducted = Math.min(currentStock, it.qty);
      if (currentStock - it.qty < 0) {
        warnings.push({
          productId: String(p._id),
          name: p.name || p.sku || String(p._id),
          stockBefore: currentStock,
          qtyRequested: it.qty,
          stockAfter: 0,
        });
      }
      p.stock = Math.max(0, currentStock - deducted);
      if (typeof p.giacenza === "number") p.giacenza = Math.max(0, p.giacenza - deducted);
      if (typeof p.disponibili === "number") p.disponibili = Math.max(0, p.disponibili - deducted);
      p.inStock = p.stock > 0;
      await p.save();
      stockDeductedByProductId.set(
        it.productId,
        (stockDeductedByProductId.get(it.productId) || 0) + deducted
      );
    }

    const subtotal = parsed.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const totalPurchase = parsed.reduce((s, it) => s + it.unitPurchasePrice * it.qty, 0);
    const d = Number(discountPct);
    const dPct = Number.isFinite(d) ? Math.min(100, Math.max(0, d)) : 0;
    const total = subtotal * (1 - dPct / 100);
    const profit = total - totalPurchase;

    // Numero progressivo: assegnato SOLO al salvataggio (DB)
    const counter = await Counter.findOneAndUpdate(
      { key: "saleNumber" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const saleNumber = counter.seq;

    const sale = new Sale({
      saleNumber,
      openedAt: openedAt ? new Date(openedAt) : undefined,
      createdBy: req.user?._id,
      createdByEmail: req.user?.email,
      notes: notes || "",
      items: parsed.map((it) => {
        const p = productsById.get(it.productId);
        const left = stockDeductedByProductId.get(it.productId) || 0;
        const lineDeducted = Math.min(left, it.qty);
        stockDeductedByProductId.set(it.productId, Math.max(0, left - lineDeducted));
        return {
          productId: p._id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          qty: it.qty,
          stockDeductedQty: lineDeducted,
          unitPrice: it.unitPrice,
          unitPurchasePrice: it.unitPurchasePrice,
          priceType: String(priceType || ""),
        };
      }),
      subtotal,
      discountPct: dPct,
      total,
      totalPurchase,
      profit,
    });
    await sale.save();

    res.status(201).json({ data: sale, warnings });
  } catch (err) {
    res.status(400).json({ error: err.message || "Errore conferma vendita" });
  }
});

module.exports = router;

