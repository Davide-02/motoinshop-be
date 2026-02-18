require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const motoSchema = new mongoose.Schema({
  marca: String,
  cilindrata: Number,
  modello: String,
  anni: [Number],
  categoria: String,
  paese: String,
});

const Moto = mongoose.model("moto", motoSchema);

const data = [
  {
    marca: "Honda",
    cilindrata: 600,
    modello: "CBR 600 RR",
    anni: [2019, 2020, 2021, 2022],
    categoria: "Sport",
    paese: "Giappone",
  },
  {
    marca: "Honda",
    cilindrata: 1000,
    modello: "CBR 1000 RR",
    anni: [2018, 2019, 2020, 2021, 2022],
    categoria: "Sport",
    paese: "Giappone",
  },
  {
    marca: "Yamaha",
    cilindrata: 700,
    modello: "MT-07",
    anni: [2017, 2018, 2019, 2020, 2021, 2022, 2023],
    categoria: "Naked",
    paese: "Giappone",
  },
  {
    marca: "BMW",
    cilindrata: 1250,
    modello: "R 1250 GS",
    anni: [2019, 2020, 2021, 2022, 2023],
    categoria: "Adventure",
    paese: "Germania",
  },
  {
    marca: "Ducati",
    cilindrata: 1103,
    modello: "Panigale V4",
    anni: [2018, 2019, 2020, 2021, 2022, 2023],
    categoria: "Sport",
    paese: "Italia",
  },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Mongo connected");

    await Moto.deleteMany(); // cancella tutto prima di reinserire
    console.log("Old data removed");

    await Moto.insertMany(data);
    console.log("Database seeded successfully");

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seed();
