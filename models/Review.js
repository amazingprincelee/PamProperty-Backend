const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  property:      { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  reviewer:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  escrowSession: { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowSession', required: true },
  rating:        { type: Number, required: true, min: 1, max: 5 },
  comment:       { type: String, default: '', maxlength: 500, trim: true },
}, { timestamps: true });

// One review per user per property
ReviewSchema.index({ property: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);
