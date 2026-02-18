const mongoose = require("mongoose");

const motoSchema = new mongoose.Schema(
  {
    marca: {
      type: String,
      required: true,
      trim: true,
    },
    modello: {
      type: String,
      required: true,
      trim: true,
    },
    cilindrata: {
      type: Number,
      default: 0,
    },
    anni: {
      type: [Number],
      default: [],
    },
    categoria: {
      type: String,
      default: "Unknown",
      trim: true,
    },
    paese: {
      type: String,
      default: "Unknown",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indici per velocità query
motoSchema.index({ marca: 1 });
motoSchema.index({ marca: 1, cilindrata: 1 });
motoSchema.index({ marca: 1, cilindrata: 1, modello: 1 });
motoSchema.index({ modello: "text" });

module.exports = mongoose.model("Moto", motoSchema);
