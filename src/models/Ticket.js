const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ["customer", "admin"], required: true },
  message: { type: String, required: true },
  attachments: [String],
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userEmail: { type: String, required: true },
    userName: { type: String },
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["aperto", "in_lavorazione", "chiuso", "annullato"],
      default: "aperto",
    },
    priority: {
      type: String,
      enum: ["bassa", "media", "alta"],
      default: "media",
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedToName: { type: String },
    messages: [messageSchema],
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    unreadByUser: { type: Boolean, default: false },
    relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    relatedOrderNumber: { type: String },
  },
  { timestamps: true }
);

ticketSchema.pre("save", async function () {
  if (!this.ticketNumber) {
    const count = await mongoose.model("Ticket").countDocuments();
    this.ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
  }
});

ticketSchema.index({ userId: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ assignedTo: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ userId: 1, unreadByUser: 1 });

module.exports = mongoose.model("Ticket", ticketSchema);
