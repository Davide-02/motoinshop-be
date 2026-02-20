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
    stock: Number,
    inStock: Boolean,
    categories: [String],
    tags: [String],
    images: [String],
    published: Boolean,
    type: String,
  },
  { timestamps: true }
);

// Indici per ricerche veloci
productSchema.index({ name: "text", shortDescription: "text" });
productSchema.index({ categories: 1 });
productSchema.index({ inStock: 1 });
productSchema.index({ price: 1 });

module.exports = mongoose.model("Product", productSchema);
