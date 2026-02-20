const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const User = require("../models/User");

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
