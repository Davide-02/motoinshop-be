require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const motoRoutes = require("./routes/moto");
const productRoutes = require("./routes/products");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API moto (filtri marca/modello/anno)
app.use("/api", motoRoutes);

// API products (CRUD prodotti)
app.use("/api/products", productRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, message: "MotoIn API" });
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "motoin" });
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
