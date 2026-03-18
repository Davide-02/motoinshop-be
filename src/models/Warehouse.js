const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Nome magazzino
    code: { type: String, trim: true }, // Codice interno (opzionale)
    active: { type: Boolean, default: true },

    // Indirizzo
    address: { type: String, trim: true }, // Via/Piazza + civico
    cap: { type: String, trim: true },
    province: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },

    // Contatti
    phone: { type: String, trim: true },
    email: { type: String, trim: true },

    // Responsabile magazzino
    managerName: { type: String, trim: true },
    managerPhone: { type: String, trim: true },
    managerEmail: { type: String, trim: true },

    // Struttura (conteggi)
    departmentsCount: { type: Number, default: 0, min: 0 },
    shelvesCount: { type: Number, default: 0, min: 0 },
    aislesCount: { type: Number, default: 0, min: 0 },
    binsCount: { type: Number, default: 0, min: 0 },

    // Dettagli opzionali
    departments: [{ type: String, trim: true }],
    shelves: [{ type: String, trim: true }],

    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

warehouseSchema.index({ name: 1 });
warehouseSchema.index({ code: 1 });

module.exports = mongoose.model("Warehouse", warehouseSchema);

