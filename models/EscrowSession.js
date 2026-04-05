const mongoose = require('mongoose');

const EscrowSessionSchema = new mongoose.Schema({
  seeker:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lister:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  property:    { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  amount:      { type: Number, required: true },

  // Type determines fee structure on release
  escrowType: {
    type: String,
    enum: ['inspection', 'bush_entry', 'hotel_booking', 'general'],
    default: 'general',
  },
  referrerCredited: { type: Boolean, default: false },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'payment_requested', 'released', 'refunded', 'disputed'],
    default: 'pending',
  },

  // Inspection details (set by lister after confirming)
  inspectionDate: { type: Date, default: null },
  inspectionTime: { type: String, default: null },
  inspectionNote: { type: String, default: null },

  // Dispute
  disputeReason:  { type: String, default: null },
  disputedAt:     { type: Date,   default: null },

  // Auto-release safety window (e.g. 14 days after inspection)
  autoReleaseDate: { type: Date, default: null },
  autoRefundDate:  { type: Date, default: null },

  confirmedAt:    { type: Date, default: null },
  inspectedAt:    { type: Date, default: null },
  resolvedAt:     { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('EscrowSession', EscrowSessionSchema);
