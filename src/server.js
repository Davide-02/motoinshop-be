require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const motoRoutes = require("./routes/moto");
const productRoutes = require("./routes/products");
const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const ticketRoutes = require("./routes/tickets");

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json());

// Serve immagini statiche dalla cartella uploads
app.use("/api/images", express.static(path.join(__dirname, "../uploads/products"), {
  maxAge: "1y", // Cache per 1 anno
  etag: true,
  lastModified: true,
}));

// API moto (filtri marca/modello/anno e CRUD)
app.use("/api", motoRoutes);

// API products (CRUD prodotti)
app.use("/api/products", productRoutes);

// API auth (autenticazione)
app.use("/api/auth", authRoutes);

// API orders (ordini)
app.use("/api/orders", orderRoutes);

// API tickets (supporto)
app.use("/api/tickets", ticketRoutes);

// Serve file allegati ticket
app.use("/api/tickets/files", express.static(path.join(__dirname, "../uploads/tickets"), {
  maxAge: "1d",
  etag: true,
  lastModified: true,
}));

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
