const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "motoin_secret_key_change_in_production";
const JWT_EXPIRES_IN = "24h";

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
    const user = await User.findById(decoded.userId);

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
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // Verifica password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // Verifica che l'utente sia attivo
    if (!user.isActive) {
      return res.status(401).json({ error: "Account disattivato" });
    }

    // Genera token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
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
  res.json({ user: req.user });
});

// PUT /api/auth/me - Aggiorna profilo
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (address) updates.address = address;

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
