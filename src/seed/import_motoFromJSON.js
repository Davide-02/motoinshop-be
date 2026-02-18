require("dotenv").config();
const mongoose = require("mongoose");
const Moto = require("../models/Moto");

// Import JSON
const marcheJSON = require("./marche.json");
const modelliJSON = require("./modelli.json");

async function importMoto() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "motoin" });
    console.log("Mongo connected");

    // Cancella dati vecchi
    await Moto.deleteMany();

    const brandMap = new Map();
    marcheJSON.data.forEach((b) => {
      brandMap.set(b.id, b.name);
    });

    const motoData = modelliJSON.data.map((model) => {
      const marca = brandMap.get(model.brand_id) || "Unknown";

      // Estrai cilindrata dal nome modello
      const ccMatch = model.name.match(/\b(\d{2,4})\b/);
      const cilindrata = ccMatch ? parseInt(ccMatch[1], 10) : 0;

      // Placeholder anni
      const anni = [2020, 2021, 2022];

      return {
        marca,
        cilindrata,
        modello: model.name,
        anni,
        categoria: "Unknown", // Puoi migliorare se vuoi
        paese: "Unknown", // Puoi aggiungere se vuoi
      };
    });

    await Moto.insertMany(motoData);
    console.log(`Database populated with ${motoData.length} motos`);

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

importMoto();
