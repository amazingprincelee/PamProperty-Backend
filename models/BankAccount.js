const mongoose = require('mongoose');

const BankAccountSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bankName:      { type: String, required: true },
  bankCode:      { type: String, required: true },
  accountNumber: { type: String, required: true },
  accountName:   { type: String, required: true }, // verified by Paystack
  isDefault:     { type: Boolean, default: false },
}, { timestamps: true });

// Only one default per user
BankAccountSchema.index({ user: 1, accountNumber: 1, bankCode: 1 }, { unique: true });

module.exports = mongoose.model('BankAccount', BankAccountSchema);
