const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: String,
    sku: String,
    barcode: String,
    qty: { type: Number, required: true, min: 1 },
    // Quantità realmente scalata a magazzino (può essere < qty in caso di overselling)
    stockDeductedQty: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitPurchasePrice: { type: Number, required: true, min: 0 },
    priceType: String,
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    saleNumber: { type: Number, index: true },
    openedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdByEmail: String,
    items: { type: [saleItemSchema], default: [] },
    subtotal: { type: Number, default: 0 }, // totale prima di sconti
    discountPct: { type: Number, default: 0 },
    total: { type: Number, default: 0 }, // totale dopo sconto
    totalPurchase: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    notes: String,
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Sale", saleSchema);

