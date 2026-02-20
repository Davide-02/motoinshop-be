const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "motoin_secret_key_change_in_production";

// Middleware autenticazione
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Token mancante" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Utente non trovato o disattivato" });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token non valido" });
  }
};

// Middleware admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Accesso negato. Solo admin." });
  }
  next();
};

// GET /api/orders - Lista ordini (admin: tutti, user: solo i propri)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page = 1, per_page = 20, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(per_page);

    const query = {};
    
    // Se non admin, mostra solo i propri ordini
    if (req.user.role !== "admin") {
      query.userId = req.user._id;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { customerEmail: { $regex: search, $options: "i" } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(per_page))
        .populate("userId", "name email"),
      Order.countDocuments(query),
    ]);

    res.json({
      data: orders,
      pagination: {
        page: Number(page),
        per_page: Number(per_page),
        total,
        totalPages: Math.ceil(total / Number(per_page)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/stats - Statistiche ordini (solo admin)
router.get("/stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: "processing" }),
      Order.countDocuments({ status: "shipped" }),
      Order.countDocuments({ status: "delivered" }),
      Order.countDocuments({ status: "cancelled" }),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
    ]);

    res.json({
      total: totalOrders,
      pending: pendingOrders,
      processing: processingOrders,
      shipped: shippedOrders,
      delivered: deliveredOrders,
      cancelled: cancelledOrders,
      revenue: totalRevenue[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id - Singolo ordine
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("userId", "name email");
    
    if (!order) {
      return res.status(404).json({ error: "Ordine non trovato" });
    }

    // Se non admin, verifica che sia il proprio ordine
    if (req.user.role !== "admin" && order.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Accesso negato" });
    }

    res.json({ data: order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders - Crea ordine
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      items,
      billingAddress,
      shippingAddress,
      shippingMethod,
      shippingCost,
      notes,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Nessun prodotto nell'ordine" });
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + (shippingCost || 0);

    const order = new Order({
      userId: req.user._id,
      customerEmail: req.user.email,
      customerPhone: req.user.phone,
      items,
      billingAddress,
      shippingAddress: shippingAddress || billingAddress,
      shippingMethod: shippingMethod || "premium",
      shippingCost: shippingCost || 0,
      subtotal,
      total,
      notes,
    });

    await order.save();

    res.status(201).json({
      message: "Ordine creato",
      data: order,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id - Aggiorna ordine (solo admin)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, paymentStatus, adminNotes, shippedAt, deliveredAt } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (shippedAt) updateData.shippedAt = shippedAt;
    if (deliveredAt) updateData.deliveredAt = deliveredAt;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Ordine non trovato" });
    }

    res.json({
      message: "Ordine aggiornato",
      data: order,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id - Elimina ordine (solo admin)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Ordine non trovato" });
    }

    res.json({ message: "Ordine eliminato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
