const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "motoin_secret_key_change_in_production";

// Configurazione upload
const uploadDir = path.join(__dirname, "../../uploads/tickets");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `ticket-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo file non supportato. Usa immagini o video."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Middleware autenticazione
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token mancante" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Utente non trovato o disattivato" });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token scaduto", expired: true });
    }
    return res.status(401).json({ error: "Token non valido" });
  }
};

// Middleware admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  next();
};

// GET /api/tickets - Lista ticket (utente: solo i suoi, admin: tutti)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {};

    // Utente normale vede solo i suoi ticket
    if (req.user.role !== "admin") {
      query.userId = req.user._id;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { ticketNumber: { $regex: search, $options: "i" } },
      ];
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("assignedTo", "nome cognome email"),
      Ticket.countDocuments(query),
    ]);

    res.json({
      data: tickets,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/notifications - Notifiche non lette per utente
router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const count = await Ticket.countDocuments({
      userId: req.user._id,
      unreadByUser: true,
    });
    res.json({ unread: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/stats - Statistiche ticket (admin)
router.get("/stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [total, aperti, inLavorazione, chiusi, annullati] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: "aperto" }),
      Ticket.countDocuments({ status: "in_lavorazione" }),
      Ticket.countDocuments({ status: "chiuso" }),
      Ticket.countDocuments({ status: "annullato" }),
    ]);

    res.json({ total, aperti, inLavorazione, chiusi, annullati });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id - Singolo ticket
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("userId", "nome cognome email")
      .populate("assignedTo", "nome cognome email")
      .populate("messages.senderId", "nome cognome email");

    if (!ticket) {
      return res.status(404).json({ error: "Ticket non trovato" });
    }

    // Verifica accesso
    if (req.user.role !== "admin" && !ticket.userId._id.equals(req.user._id)) {
      return res.status(403).json({ error: "Accesso non autorizzato" });
    }

    // Se l'utente (non admin) visualizza il ticket, segna come letto
    if (req.user.role !== "admin" && ticket.unreadByUser) {
      ticket.unreadByUser = false;
      await ticket.save();
    }

    res.json({ data: ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets - Crea nuovo ticket
router.post("/", authMiddleware, upload.array("attachments", 5), async (req, res) => {
  try {
    const { title, message, priority, relatedOrderId } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Titolo e messaggio sono obbligatori" });
    }

    // Gestione allegati
    const attachments = req.files
      ? req.files.map((f) => `/api/tickets/files/${f.filename}`)
      : [];

    const ticketData = {
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.nome || ""} ${req.user.cognome || ""}`.trim() || req.user.email,
      title,
      priority: priority || "media",
      messages: [
        {
          senderId: req.user._id,
          senderName: `${req.user.nome || ""} ${req.user.cognome || ""}`.trim() || req.user.email,
          senderRole: req.user.role,
          message,
          attachments,
        },
      ],
    };

    // Se è collegato a un ordine, verifica e aggiungi
    if (relatedOrderId) {
      const Order = require("../models/Order");
      const order = await Order.findOne({ _id: relatedOrderId, userId: req.user._id });
      if (order) {
        ticketData.relatedOrderId = order._id;
        ticketData.relatedOrderNumber = order.orderNumber;
      }
    }

    const ticket = new Ticket(ticketData);
    await ticket.save();
    res.status(201).json({ data: ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets/:id/messages - Aggiungi messaggio
router.post("/:id/messages", authMiddleware, upload.array("attachments", 5), async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Messaggio obbligatorio" });
    }

    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket non trovato" });
    }

    // Verifica accesso
    if (req.user.role !== "admin" && !ticket.userId.equals(req.user._id)) {
      return res.status(403).json({ error: "Accesso non autorizzato" });
    }

    // Non permettere messaggi su ticket chiusi o annullati
    if (["chiuso", "annullato"].includes(ticket.status)) {
      return res.status(400).json({ error: "Impossibile aggiungere messaggi a ticket chiusi o annullati" });
    }

    const attachments = req.files
      ? req.files.map((f) => `/api/tickets/files/${f.filename}`)
      : [];

    ticket.messages.push({
      senderId: req.user._id,
      senderName: `${req.user.nome || ""} ${req.user.cognome || ""}`.trim() || req.user.email,
      senderRole: req.user.role,
      message,
      attachments,
    });

    // Se admin risponde, notifica l'utente
    if (req.user.role === "admin") {
      ticket.unreadByUser = true;
    }

    await ticket.save();
    res.json({ data: ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tickets/:id - Aggiorna ticket (admin o proprietario per annullamento)
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { status, priority, assignedTo } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket non trovato" });
    }

    // Utente normale può solo annullare il proprio ticket
    if (req.user.role !== "admin") {
      if (!ticket.userId.equals(req.user._id)) {
        return res.status(403).json({ error: "Accesso non autorizzato" });
      }
      // Utente può solo annullare
      if (status !== "annullato") {
        return res.status(403).json({ error: "Puoi solo annullare il tuo ticket" });
      }
      // Non può annullare ticket già chiusi
      if (["chiuso", "annullato"].includes(ticket.status)) {
        return res.status(400).json({ error: "Ticket già chiuso o annullato" });
      }
      ticket.status = "annullato";
      await ticket.save();
      return res.json({ data: ticket });
    }

    // Admin può fare tutto
    let statusChanged = false;
    if (status) {
      statusChanged = ticket.status !== status;
      ticket.status = status;
      if (status === "chiuso") {
        ticket.closedAt = new Date();
        ticket.closedBy = req.user._id;
      }
    }

    if (priority) {
      ticket.priority = priority;
    }

    if (assignedTo) {
      const admin = await User.findById(assignedTo);
      if (admin && admin.role === "admin") {
        ticket.assignedTo = admin._id;
        ticket.assignedToName = `${admin.nome || ""} ${admin.cognome || ""}`.trim() || admin.email;
        if (ticket.status === "aperto") {
          ticket.status = "in_lavorazione";
          statusChanged = true;
        }
      }
    }

    // Notifica utente se stato cambiato da admin
    if (statusChanged) {
      ticket.unreadByUser = true;
    }

    await ticket.save();
    res.json({ data: ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tickets/:id/take - Prendi in carico (admin)
router.put("/:id/take", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket non trovato" });
    }

    ticket.assignedTo = req.user._id;
    ticket.assignedToName = `${req.user.nome || ""} ${req.user.cognome || ""}`.trim() || req.user.email;
    ticket.status = "in_lavorazione";
    ticket.unreadByUser = true;

    await ticket.save();
    res.json({ data: ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tickets/:id - Elimina ticket (admin)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket non trovato" });
    }
    res.json({ message: "Ticket eliminato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
