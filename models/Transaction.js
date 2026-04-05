const mongoose = require('mongoose');

// Ledger-based wallet — balance is always computed from transactions, never stored
const TransactionSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, enum: ['credit', 'debit'], required: true },
  amount:      { type: Number, required: true }, // always positive
  description: { type: String, required: true },
  category:    {
    type: String,
    enum: ['topup', 'withdrawal', 'escrow_hold', 'escrow_release', 'escrow_refund', 'hotel_payment', 'hotel_refund', 'platform_fee', 'referral_bonus'],
    required: true,
  },

  // Payment reference (Paystack ref for real money movements)
  paystackRef: { type: String, default: null },

  // Link to related entity
  relatedEscrow:       { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowSession', default: null },
  relatedHotelBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelBooking',  default: null },
  relatedProperty:     { type: mongoose.Schema.Types.ObjectId, ref: 'Property',       default: null },

  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
