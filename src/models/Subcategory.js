const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true, unique: true } },
  { timestamps: true }
);

subcategorySchema.index({ name: 1 });
module.exports = mongoose.model("Subcategory", subcategorySchema);
