const mongoose = require("mongoose");

const accessLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    ip: { type: String },
    userAgent: { type: String },
    success: { type: Boolean, default: true },
    reason: { type: String },
  },
  { timestamps: true }
);

accessLogSchema.index({ userId: 1, createdAt: -1 });
accessLogSchema.index({ createdAt: 1 });

module.exports = mongoose.model("AccessLog", accessLogSchema);

