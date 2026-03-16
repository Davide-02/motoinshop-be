const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Ragione sociale
    code: { type: String, trim: true },
    address: { type: String, trim: true },
    cap: { type: String, trim: true },
    province: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    disabledList: { type: Boolean, default: false },
    partitaIva: { type: String, trim: true },
    codiceFiscale: { type: String, trim: true },
    codiceIvaFlag: { type: Boolean, default: false },
    bank: { type: String, trim: true },
    iban: { type: String, trim: true },
    payment: { type: String, trim: true },
    openingBalance: { type: Number, default: 0 },
    phone: { type: String, trim: true },
    mobile: { type: String, trim: true },
    fax: { type: String, trim: true },
    email: { type: String, trim: true },
    web: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 });

module.exports = mongoose.model("Supplier", supplierSchema);

