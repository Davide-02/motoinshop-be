const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    wcId: Number,
    sku: String,
    name: String,
    shortDescription: String,
    description: String,
    price: Number,
    regularPrice: Number,
    salePrice: Number,
    mechanicalPrice: Number,   // prezzo meccanico
    wholesalePrice: Number,   // prezzo ingrosso
    stock: { type: Number, min: 0 },
    inStock: Boolean,
    categories: [String],
    tags: [String],
    images: [String],
    published: Boolean,
    type: String,
    // Compatibilità moto
    compatibility: [{
      brand: String,
      model: String,
      cilindrata: Number, // cc, tra modello e anni
      years: [Number],
      frame: String,
      posizione: String, // es. "Anteriore", "Posteriore" - solo per categoria Impianto frenante
    }],
  },
  { timestamps: true }
);

// Indici per ricerche veloci
productSchema.index({ name: "text", shortDescription: "text" });
productSchema.index({ categories: 1 });
productSchema.index({ inStock: 1 });
productSchema.index({ price: 1 });
productSchema.index({ "compatibility.brand": 1 });
productSchema.index({ "compatibility.model": 1 });
productSchema.index({ "compatibility.years": 1 });

module.exports = mongoose.model("Product", productSchema);
