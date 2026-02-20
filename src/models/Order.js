const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image: String,
});

const addressSchema = new mongoose.Schema({
  nome: String,
  cognome: String,
  via: String,
  cap: String,
  citta: String,
  provincia: String,
  paese: { type: String, default: "Italia" },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    customerEmail: { type: String, required: true },
    customerPhone: String,
    
    items: [orderItemSchema],
    
    billingAddress: addressSchema,
    shippingAddress: addressSchema,
    
    shippingMethod: { type: String, enum: ["premium", "pickup"], default: "premium" },
    shippingCost: { type: Number, default: 0 },
    
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending",
    },
    
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: String,
    paymentId: String,
    
    notes: String,
    adminNotes: String,
    
    shippedAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true }
);

orderSchema.index({ status: 1 });
orderSchema.index({ userId: 1 });
orderSchema.index({ customerEmail: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderNumber: 1 });

orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    const count = await mongoose.model("Order").countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    this.orderNumber = `MO${year}${month}-${String(count + 1).padStart(5, "0")}`;
  }
});

module.exports = mongoose.model("Order", orderSchema);
