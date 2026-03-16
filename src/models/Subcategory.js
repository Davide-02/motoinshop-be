const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: false },
  },
  { timestamps: true }
);

subcategorySchema.index({ name: 1 });
subcategorySchema.index({ category: 1, name: 1 });
module.exports = mongoose.model("Subcategory", subcategorySchema);
