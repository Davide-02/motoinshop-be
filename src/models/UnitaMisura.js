const mongoose = require("mongoose");

const unitaMisuraSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true, unique: true } },
  { timestamps: true }
);

unitaMisuraSchema.index({ name: 1 });
module.exports = mongoose.model("UnitaMisura", unitaMisuraSchema);
