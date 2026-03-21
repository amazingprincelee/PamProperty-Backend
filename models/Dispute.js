const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  raisedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  against:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  escrow:      { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowSession', default: null },
  hotelBooking:{ type: mongoose.Schema.Types.ObjectId, ref: 'HotelBooking',  default: null },
  reason:      { type: String, required: true },
  evidence:    [{ type: String }], // Cloudinary URLs
  status:      { type: String, enum: ['open', 'under_review', 'resolved_seeker', 'resolved_lister', 'closed'], default: 'open' },
  adminNote:   { type: String, default: '' },
  resolvedAt:  { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Dispute', DisputeSchema);
