require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const motoRoutes = require("./routes/moto");
const productRoutes = require("./routes/products");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Serve immagini statiche dalla cartella uploads
app.use("/api/images", express.static(path.join(__dirname, "../uploads/products"), {
  maxAge: "1y", // Cache per 1 anno
  etag: true,
  lastModified: true,
}));

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
