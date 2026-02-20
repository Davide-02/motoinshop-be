require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@motoin.it";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin MotoIn";

async function createAdmin() {
  console.log("=== Creazione Utente Admin ===\n");

  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "motoin" });
    console.log("MongoDB connesso\n");

    // Verifica se esiste già
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log(`Admin già esistente: ${ADMIN_EMAIL}`);
      if (existingAdmin.role !== "admin") {
        existingAdmin.role = "admin";
        await existingAdmin.save();
        console.log("Ruolo aggiornato a admin");
      }
      process.exit(0);
    }

    // Crea admin
    const admin = new User({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
      role: "admin",
    });

    await admin.save();

    console.log("Admin creato con successo!");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log("\nIMPORTANTE: Cambia la password dopo il primo accesso!");

    process.exit(0);
  } catch (err) {
    console.error("Errore:", err);
    process.exit(1);
  }
}

createAdmin();
