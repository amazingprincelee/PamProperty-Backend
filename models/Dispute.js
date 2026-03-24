const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  raisedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  against:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  escrow:      { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowSession', default: null },
  hotelBooking:{ type: mongoose.Schema.Types.ObjectId, ref: 'HotelBooking',  default: null },

  // Initial claim
  reason:      { type: String, required: true },
  evidence:    [{ type: String }], // Cloudinary URLs

  // Counter-statement (the "against" party responds)
  counterStatement:    { type: String, default: '' },
  counterEvidence:     [{ type: String }],
  counterSubmittedAt:  { type: Date, default: null },

  // Admin resolution
  status: {
    type: String,
    enum: ['open', 'under_review', 'awaiting_response', 'resolved', 'closed'],
    default: 'open',
  },
  adminNote:       { type: String, default: '' },
  resolutionType:  { type: String, enum: ['refund_seeker', 'pay_lister', 'split', ''], default: '' },
  splitPercent:    { type: Number, default: null }, // % to seeker (0–100)
  resolvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt:      { type: Date, default: null },

  // Admin can request more info
  infoRequestedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  infoRequestNote:   { type: String, default: '' },
  infoDeadline:      { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Dispute', DisputeSchema);
