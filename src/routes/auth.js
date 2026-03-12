const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const User = require("../models/User");
const Order = require("../models/Order");
const Ticket = require("../models/Ticket");
const AccessLog = require("../models/AccessLog");
const PDFDocument = require("pdfkit");

// Configurazione upload avatar
const avatarDir = path.join(__dirname, "../../uploads/avatars");
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user._id}${ext}`);
  },
});

const avatarFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Solo immagini (JPEG, PNG, GIF, WebP) sono permesse"), false);
  }
};

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const JWT_SECRET = process.env.JWT_SECRET || "motoin_secret_key_change_in_production";
// Timeout di sessione: 48 ore
const JWT_EXPIRES_IN = "48h";

// Blacklist per token invalidati (in memoria - in produzione usare Redis)
const tokenBlacklist = new Set();

// Middleware per verificare il token
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({ error: "Token mancante" });
    }

    // Verifica se il token è nella blacklist
    if (tokenBlacklist.has(token)) {
      return res.status(401).json({ error: "Token invalidato" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password").lean();

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Utente non trovato o disattivato" });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token scaduto", expired: true });
    }
    res.status(401).json({ error: "Token non valido" });
  }
};

// Middleware per verificare ruolo admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Accesso negato. Solo admin." });
  }
  next();
};

// POST /api/auth/register - Registrazione
router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      nome,
      cognome,
      phone,
      codiceFiscale,
      partitaIva,
      pec,
      codiceDestinatario,
      billingAddress,
      shippingAddress,
      useShippingAsBilling,
    } = req.body;

    // Verifica se l'email esiste già
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: "Email già registrata" });
    }

    // Crea nuovo utente (sempre come customer)
    const user = new User({
      email,
      password,
      nome,
      cognome,
      phone,
      codiceFiscale,
      partitaIva,
      pec,
      codiceDestinatario,
      billingAddress,
      shippingAddress,
      useShippingAsBilling,
      role: "customer",
    });

    await user.save();

    // Genera token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(201).json({
      message: "Registrazione completata",
      user,
      token,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login - Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Trova utente
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Log tentativo fallito (utente inesistente)
      await AccessLog.create({
        userId: null,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: false,
        reason: "user_not_found",
      });
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // Verifica password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Log tentativo fallito (password errata)
      await AccessLog.create({
        userId: user._id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: false,
        reason: "wrong_password",
      });
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // Verifica che l'utente sia attivo
    if (!user.isActive) {
      // Log tentativo fallito (account disattivato)
      await AccessLog.create({
        userId: user._id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: false,
        reason: "inactive_account",
      });
      return res.status(401).json({ error: "Account disattivato" });
    }

    // Genera token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Log accesso riuscito
    await AccessLog.create({
      userId: user._id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
      reason: "login_success",
    });

    res.json({
      message: "Login effettuato",
      user,
      token,
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout - Logout (invalida token)
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    // Aggiungi token alla blacklist
    tokenBlacklist.add(req.token);
    
    // Pulisci token scaduti dalla blacklist ogni tanto (semplice cleanup)
    if (tokenBlacklist.size > 10000) {
      tokenBlacklist.clear();
    }

    res.json({ message: "Logout effettuato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - Utente corrente
router.get("/me", authMiddleware, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    res.status(500).json({ error: err.message || "Errore server" });
  }
});

// PUT /api/auth/me - Aggiorna profilo
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const {
      nome,
      cognome,
      phone,
      codiceFiscale,
      partitaIva,
      pec,
      codiceDestinatario,
      billingAddress,
      shippingAddress,
      useShippingAsBilling,
      themePreference,
    } = req.body;

    const updates = {};
    if (nome !== undefined) updates.nome = nome;
    if (cognome !== undefined) updates.cognome = cognome;
    if (phone !== undefined) updates.phone = phone;
    if (codiceFiscale !== undefined) updates.codiceFiscale = codiceFiscale;
    if (partitaIva !== undefined) updates.partitaIva = partitaIva;
    if (pec !== undefined) updates.pec = pec;
    if (codiceDestinatario !== undefined) updates.codiceDestinatario = codiceDestinatario;
    if (billingAddress !== undefined) updates.billingAddress = billingAddress;
    if (shippingAddress !== undefined) updates.shippingAddress = shippingAddress;
    if (useShippingAsBilling !== undefined) updates.useShippingAsBilling = useShippingAsBilling;
    if (themePreference !== undefined && ["light", "dark"].includes(themePreference)) {
      updates.themePreference = themePreference;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/auth/me - Elimina definitivamente l'account utente (richiesta dall'utente stesso)
router.delete("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // Soft delete + anonimizzazione del profilo
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    // Rimuovi avatar fisico se presente
    if (user.avatar) {
      const avatarPath = path.join(avatarDir, path.basename(user.avatar));
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    user.nome = "Utente";
    user.cognome = "Eliminato";
    user.phone = null;
    user.codiceFiscale = null;
    user.partitaIva = null;
    user.pec = null;
    user.codiceDestinatario = null;
    user.billingAddress = undefined;
    user.shippingAddress = undefined;
    user.useShippingAsBilling = true;
    user.paymentMethods = [];
    user.avatar = null;
    user.isActive = false;
    user.deletedAt = new Date();

    await user.save();

    // Anonimizza ordini collegati all'utente (manteniamo solo dati fiscali necessari)
    await Order.updateMany(
      { userId },
      {
        $set: {
          userId: null,
          customerPhone: null,
        },
      }
    );

    // Aggiorna ticket collegati all'utente (pseudonimizzazione)
    const tickets = await Ticket.find({ userId });
    for (const ticket of tickets) {
      ticket.userId = null;
      ticket.userEmail = null;
      ticket.userName = "Utente eliminato";
      ticket.unreadByUser = false;

      ticket.messages.forEach((msg) => {
        if (msg.senderId && msg.senderId.toString() === userId.toString()) {
          msg.senderId = null;
          msg.senderName = "Utente eliminato";
        }
      });

      await ticket.save();
    }

    // Invalida il token corrente
    if (req.token) {
      tokenBlacklist.add(req.token);
    }

    res.json({ message: "Account disattivato e dati anonimizati (soft delete con retention)" });
  } catch (err) {
    console.error("DELETE /api/auth/me error:", err);
    res.status(500).json({ error: err.message || "Errore server" });
  }
});

// GET /api/auth/me/export - Portabilità dati utente (JSON, CSV, PDF)
router.get("/me/export", authMiddleware, async (req, res) => {
  try {
    const format = (req.query.format || "json").toString().toLowerCase();

    const userId = req.user._id;

    const [userDoc, orders, tickets] = await Promise.all([
      User.findById(userId).lean(),
      Order.find({ userId }).lean(),
      Ticket.find({ userId }).lean(),
    ]);

    if (!userDoc) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const safeUser = {
      id: userDoc._id,
      email: userDoc.email,
      nome: userDoc.nome,
      cognome: userDoc.cognome,
      role: userDoc.role,
      phone: userDoc.phone,
      codiceFiscale: userDoc.codiceFiscale,
      partitaIva: userDoc.partitaIva,
      pec: userDoc.pec,
      codiceDestinatario: userDoc.codiceDestinatario,
      billingAddress: userDoc.billingAddress,
      shippingAddress: userDoc.shippingAddress,
      useShippingAsBilling: userDoc.useShippingAsBilling,
      isActive: userDoc.isActive,
      createdAt: userDoc.createdAt,
      updatedAt: userDoc.updatedAt,
    };

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="motoinshop-portabilita-dati.json"'
      );
      return res.json({
        generatedAt: new Date().toISOString(),
        utente: safeUser,
        ordini: orders,
        ticket: tickets,
      });
    }

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="motoinshop-portabilita-dati.csv"'
      );

      const lines = [];
      lines.push("# Dati utente");
      const userHeaders = [
        "id",
        "email",
        "nome",
        "cognome",
        "role",
        "phone",
        "codiceFiscale",
        "partitaIva",
        "pec",
        "codiceDestinatario",
        "createdAt",
        "updatedAt",
      ];
      lines.push(userHeaders.join(";"));
      const userRow = userHeaders.map((h) =>
        (safeUser[h] || "").toString().replace(/;/g, ",")
      );
      lines.push(userRow.join(";"));

      lines.push("");
      lines.push("# Ordini");
      const orderHeaders = [
        "orderNumber",
        "total",
        "shippingCost",
        "status",
        "paymentStatus",
        "createdAt",
      ];
      lines.push(orderHeaders.join(";"));
      orders.forEach((o) => {
        const row = [
          o.orderNumber || "",
          o.total != null ? o.total : "",
          o.shippingCost != null ? o.shippingCost : "",
          o.status || "",
          o.paymentStatus || "",
          o.createdAt ? o.createdAt.toISOString ? o.createdAt.toISOString() : o.createdAt : "",
        ].map((v) => v.toString().replace(/;/g, ","));
        lines.push(row.join(";"));
      });

      lines.push("");
      lines.push("# Ticket");
      const ticketHeaders = ["ticketNumber", "title", "status", "priority", "createdAt"];
      lines.push(ticketHeaders.join(";"));
      tickets.forEach((t) => {
        const row = [
          t.ticketNumber || "",
          (t.title || "").replace(/[\r\n]/g, " "),
          t.status || "",
          t.priority || "",
          t.createdAt ? (t.createdAt.toISOString ? t.createdAt.toISOString() : t.createdAt) : "",
        ].map((v) => v.toString().replace(/;/g, ","));
        lines.push(row.join(";"));
      });

      return res.send(lines.join("\n"));
    }

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="motoinshop-portabilita-dati.pdf"'
      );

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);

      doc.fontSize(18).text("MotoinShop - Portabilità dei dati", { align: "center" });
      doc.moveDown();
      doc.fontSize(10).text(`Generato il: ${new Date().toLocaleString("it-IT")}`);
      doc.moveDown();

      doc.fontSize(14).text("Dati utente", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text(`ID: ${safeUser.id}`);
      doc.text(`Email: ${safeUser.email}`);
      doc.text(`Nome: ${safeUser.nome || ""} ${safeUser.cognome || ""}`);
      doc.text(`Ruolo: ${safeUser.role}`);
      if (safeUser.phone) doc.text(`Telefono: ${safeUser.phone}`);
      if (safeUser.codiceFiscale) doc.text(`Codice Fiscale: ${safeUser.codiceFiscale}`);
      if (safeUser.partitaIva) doc.text(`Partita IVA: ${safeUser.partitaIva}`);
      if (safeUser.pec) doc.text(`PEC: ${safeUser.pec}`);
      if (safeUser.codiceDestinatario)
        doc.text(`Codice Destinatario: ${safeUser.codiceDestinatario}`);
      doc.text(`Creato il: ${safeUser.createdAt}`);
      doc.moveDown();

      doc.fontSize(14).text("Ordini", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      if (!orders.length) {
        doc.text("Nessun ordine associato.");
      } else {
        orders.forEach((o, idx) => {
          doc.text(
            `${idx + 1}. Ordine ${o.orderNumber} - Totale: €${o.total?.toFixed
              ? o.total.toFixed(2)
              : o.total || ""} - Stato: ${o.status} - Pagamento: ${o.paymentStatus}`
          );
          doc.text(
            `   Creato il: ${
              o.createdAt
                ? o.createdAt.toLocaleString
                  ? o.createdAt.toLocaleString("it-IT")
                  : o.createdAt
                : ""
            }`
          );
          doc.moveDown(0.3);
        });
      }
      doc.moveDown();

      doc.fontSize(14).text("Ticket di assistenza", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      if (!tickets.length) {
        doc.text("Nessun ticket associato.");
      } else {
        tickets.forEach((t, idx) => {
          doc.text(
            `${idx + 1}. Ticket ${t.ticketNumber} - Titolo: ${t.title} - Stato: ${t.status} - Priorità: ${t.priority}`
          );
          doc.text(
            `   Creato il: ${
              t.createdAt
                ? t.createdAt.toLocaleString
                  ? t.createdAt.toLocaleString("it-IT")
                  : t.createdAt
                : ""
            }`
          );
          doc.moveDown(0.3);
        });
      }

      doc.end();
      return;
    }

    return res.status(400).json({ error: "Formato non supportato. Usa json, csv o pdf." });
  } catch (err) {
    console.error("GET /api/auth/me/export error:", err);
    res.status(500).json({ error: err.message || "Errore server" });
  }
});

// PUT /api/auth/avatar - Upload avatar
router.put("/avatar", authMiddleware, uploadAvatar.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nessun file caricato" });
    }

    // Elimina vecchio avatar se diverso
    const user = await User.findById(req.user._id);
    if (user.avatar) {
      const oldAvatarPath = path.join(avatarDir, path.basename(user.avatar));
      if (fs.existsSync(oldAvatarPath) && oldAvatarPath !== path.join(avatarDir, req.file.filename)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Salva nuovo avatar (path relativo, il frontend aggiunge /api/be)
    const avatarUrl = `/auth/avatars/${req.file.filename}`;
    user.avatar = avatarUrl;
    await user.save();

    res.json({ avatar: avatarUrl, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/avatar - Rimuovi avatar
router.delete("/avatar", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (user.avatar) {
      const avatarPath = path.join(avatarDir, path.basename(user.avatar));
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
      user.avatar = null;
      await user.save();
    }

    res.json({ message: "Avatar rimosso", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/avatars/:filename - Serve avatar
router.get("/avatars/:filename", (req, res) => {
  const filePath = path.join(avatarDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "Avatar non trovato" });
  }
});

// GET /api/auth/payment-methods - Lista metodi di pagamento
router.get("/payment-methods", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ data: user.paymentMethods || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/payment-methods - Aggiungi metodo di pagamento
router.post("/payment-methods", authMiddleware, async (req, res) => {
  try {
    const { type, name, lastFour, expiryMonth, expiryYear, cardBrand, email, iban, isDefault } = req.body;

    if (!type) {
      return res.status(400).json({ error: "Tipo metodo pagamento obbligatorio" });
    }

    const user = await User.findById(req.user._id);
    
    // Se è default, rimuovi default dagli altri
    if (isDefault) {
      user.paymentMethods.forEach(pm => pm.isDefault = false);
    }

    // Se è il primo metodo, rendilo default
    const makeDefault = isDefault || user.paymentMethods.length === 0;

    user.paymentMethods.push({
      type,
      name,
      lastFour,
      expiryMonth,
      expiryYear,
      cardBrand,
      email,
      iban,
      isDefault: makeDefault,
    });

    await user.save();
    res.status(201).json({ data: user.paymentMethods });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/payment-methods/:id - Modifica metodo di pagamento
router.put("/payment-methods/:id", authMiddleware, async (req, res) => {
  try {
    const { type, name, lastFour, expiryMonth, expiryYear, cardBrand, email, iban, isDefault } = req.body;

    const user = await User.findById(req.user._id);
    const method = user.paymentMethods.id(req.params.id);

    if (!method) {
      return res.status(404).json({ error: "Metodo di pagamento non trovato" });
    }

    // Se diventa default, rimuovi default dagli altri
    if (isDefault) {
      user.paymentMethods.forEach(pm => pm.isDefault = false);
    }

    if (type) method.type = type;
    if (name !== undefined) method.name = name;
    if (lastFour !== undefined) method.lastFour = lastFour;
    if (expiryMonth !== undefined) method.expiryMonth = expiryMonth;
    if (expiryYear !== undefined) method.expiryYear = expiryYear;
    if (cardBrand !== undefined) method.cardBrand = cardBrand;
    if (email !== undefined) method.email = email;
    if (iban !== undefined) method.iban = iban;
    if (isDefault !== undefined) method.isDefault = isDefault;

    await user.save();
    res.json({ data: user.paymentMethods });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/payment-methods/:id - Elimina metodo di pagamento
router.delete("/payment-methods/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const method = user.paymentMethods.id(req.params.id);

    if (!method) {
      return res.status(404).json({ error: "Metodo di pagamento non trovato" });
    }

    const wasDefault = method.isDefault;
    user.paymentMethods.pull(req.params.id);

    // Se era default e ci sono altri metodi, rendi default il primo
    if (wasDefault && user.paymentMethods.length > 0) {
      user.paymentMethods[0].isDefault = true;
    }

    await user.save();
    res.json({ message: "Metodo di pagamento eliminato", data: user.paymentMethods });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/change-password - Cambia password
router.put("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Verifica password attuale
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: "Password attuale non corretta" });
    }

    // Aggiorna password
    req.user.password = newPassword;
    await req.user.save();

    res.json({ message: "Password aggiornata" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/auth/users - Lista utenti (solo admin)
router.get("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.per_page, 10) || 25;
    const skip = (page - 1) * perPage;

    const query = {};
    if (req.query.role) query.role = req.query.role;
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage),
      User.countDocuments(query),
    ]);

    res.json({
      data: users,
      pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users/stats - Statistiche utenti (solo admin)
router.get("/users/stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [total, customers, admins, active, inactive] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
    ]);

    res.json({
      total,
      customers,
      admins,
      active,
      inactive,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users/:id/access-logs - Log accessi utente (solo admin)
router.get("/users/:id/access-logs", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, per_page = 50 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const perPage = Math.min(parseInt(per_page, 10) || 50, 200);
    const skip = (pageNum - 1) * perPage;

    const query = { userId: req.params.id };

    const [logs, total] = await Promise.all([
      AccessLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      AccessLog.countDocuments(query),
    ]);

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/access-logs/older-than/:days - Pulisce log più vecchi di N giorni (solo admin)
router.delete("/access-logs/older-than/:days", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.params.days, 10);
    if (Number.isNaN(days) || days <= 0) {
      return res.status(400).json({ error: "Parametro giorni non valido" });
    }

    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await AccessLog.deleteMany({ createdAt: { $lt: threshold } });

    res.json({
      message: "Log vecchi eliminati",
      deletedCount: result.deletedCount || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/soft-deleted/cleanup - Elimina definitivamente utenti soft-deleted più vecchi di N giorni (solo admin)
router.delete("/users/soft-deleted/cleanup", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const olderThanDays = parseInt(req.query.olderThanDays, 10) || 3650; // default ~10 anni
    if (Number.isNaN(olderThanDays) || olderThanDays <= 0) {
      return res.status(400).json({ error: "Parametro olderThanDays non valido" });
    }

    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await User.deleteMany({
      deletedAt: { $lt: threshold },
      isActive: false,
      role: "customer",
    });

    res.json({
      message: "Utenti soft-deleted più vecchi della retention eliminati definitivamente",
      deletedCount: result.deletedCount || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users/:id - Singolo utente (solo admin)
router.get("/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/users - Crea utente (solo admin)
router.post("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      email,
      password,
      nome,
      cognome,
      role,
      phone,
      codiceFiscale,
      partitaIva,
      pec,
      codiceDestinatario,
      billingAddress,
      shippingAddress,
      useShippingAsBilling,
      isActive,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e password sono obbligatori" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: "Email già registrata" });
    }

    const user = new User({
      email,
      password,
      nome,
      cognome,
      role: role || "customer",
      phone,
      codiceFiscale,
      partitaIva,
      pec,
      codiceDestinatario,
      billingAddress,
      shippingAddress,
      useShippingAsBilling,
      isActive: isActive !== false,
    });

    await user.save();

    res.status(201).json({
      message: "Utente creato",
      data: user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/users/:id - Aggiorna utente (solo admin)
router.put("/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      email,
      password,
      nome,
      cognome,
      role,
      phone,
      codiceFiscale,
      partitaIva,
      pec,
      codiceDestinatario,
      billingAddress,
      shippingAddress,
      useShippingAsBilling,
      isActive,
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    // Se cambia email, verifica che non sia già in uso
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: "Email già in uso" });
      }
      user.email = email;
    }

    // Aggiorna password solo se fornita
    if (password) {
      user.password = password;
    }

    // Aggiorna altri campi
    if (nome !== undefined) user.nome = nome;
    if (cognome !== undefined) user.cognome = cognome;
    if (role !== undefined) user.role = role;
    if (phone !== undefined) user.phone = phone;
    if (codiceFiscale !== undefined) user.codiceFiscale = codiceFiscale;
    if (partitaIva !== undefined) user.partitaIva = partitaIva;
    if (pec !== undefined) user.pec = pec;
    if (codiceDestinatario !== undefined) user.codiceDestinatario = codiceDestinatario;
    if (billingAddress !== undefined) user.billingAddress = billingAddress;
    if (shippingAddress !== undefined) user.shippingAddress = shippingAddress;
    if (useShippingAsBilling !== undefined) user.useShippingAsBilling = useShippingAsBilling;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    res.json({
      message: "Utente aggiornato",
      data: user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id - Elimina utente (solo admin)
router.delete("/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Non permettere di eliminare se stesso
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: "Non puoi eliminare il tuo account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json({ message: "Utente eliminato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Esporta middleware per uso in altre route
router.authMiddleware = authMiddleware;
router.adminMiddleware = adminMiddleware;

module.exports = router;
