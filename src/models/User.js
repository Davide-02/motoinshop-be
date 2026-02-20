const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema({
  nome: { type: String, trim: true },
  cognome: { type: String, trim: true },
  azienda: { type: String, trim: true },
  via: { type: String, trim: true },
  civico: { type: String, trim: true },
  cap: { type: String, trim: true },
  citta: { type: String, trim: true },
  provincia: { type: String, trim: true },
  paese: { type: String, default: "Italia", trim: true },
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    nome: {
      type: String,
      trim: true,
    },
    cognome: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
    },
    phone: {
      type: String,
      trim: true,
    },
    codiceFiscale: {
      type: String,
      trim: true,
      uppercase: true,
    },
    partitaIva: {
      type: String,
      trim: true,
    },
    pec: {
      type: String,
      lowercase: true,
      trim: true,
    },
    codiceDestinatario: {
      type: String,
      trim: true,
      uppercase: true,
    },
    billingAddress: addressSchema,
    shippingAddress: addressSchema,
    useShippingAsBilling: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Hash password prima del salvataggio
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Metodo per verificare la password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Rimuovi password dalla risposta JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Indici (email ha già unique:true che crea l'indice)
userSchema.index({ role: 1 });

module.exports = mongoose.model("User", userSchema);
