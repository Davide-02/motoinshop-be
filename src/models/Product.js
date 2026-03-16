const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    wcId: Number,
    sku: String,
    code: String,           // Codice
    barcode: String,        // Barcode
    name: String,
    subcategory: String,    // Sottocategoria
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
    // ACQUISTO (tab Proprietà)
    fornitore: String,
    prezzoFornitore: Number,
    acquistoSconto1Pct: Number,
    acquistoSconto2Pct: Number,
    prezzoAcquisto: Number,
    codArtFornitore: String,
    ivaAcquisto: String,
    ivaVendita: String,
    unitaMisura: String,
    provvigionePct: Number,
    // LISTINI VENDITA (tab Proprietà)
    listiniVendita: [{
      ricaricoPct: Number,
      prezzo: Number,
      ivato: Boolean,
      fisso: Boolean,
    }],
    listiniSconto1Pct: Number,
    listiniSconto2Pct: Number,
    listiniSconto3Pct: Number,
    // MAGAZZINO (tab Magazzino)
    gruppo: String,
    magazzino: String,
    produttore: String,
    scaffale: String,
    reparto: String,
    caricoIniziale: Number,
    scortaMinima: Number,
    quantitaPerCollo: Number,
    pesoKg: Number,
    movimentaMagazzino: Boolean,
    escludiDalloScontrino: Boolean,
    ecommerce: Boolean,
    inOfferta: Boolean,
    artInUso: Boolean,
    fornitoriSecondari: [{
      codice: String,
      fornitore: String,
      prezzo: Number,
      sconto1Pct: Number,
      sconto2Pct: Number,
    }],
    ultimoCarico: Date,
    ultimoScarico: Date,
    ultimoCosto: Number,
    costoMedio: Number,
    ultimoPrezzoVendita: Number,
    giacenza: Number,
    impegnati: Number,
    inArrivo: Number,
    disponibili: Number,
    // VARIE (tab Varie)
    notes: String,
    ecommerceDescription: String,
    varieImageUrl: String,
    presentInTouchScreenSale: Boolean,
    productLink: String,
    generic1: String,
    generic2: String,
    generic3: String,
    generic4: String,
    color: String,
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
