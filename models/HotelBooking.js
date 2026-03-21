const mongoose = require('mongoose');

const HotelBookingSchema = new mongoose.Schema({
  hotel:        { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  guest:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roomType:     { type: String, required: true },
  pricePerNight:{ type: Number, required: true },
  checkIn:      { type: Date, required: true },
  checkOut:     { type: Date, required: true },
  nights:       { type: Number, required: true },
  roomCost:     { type: Number, required: true },
  platformFee:  { type: Number, required: true }, // 10%
  total:        { type: Number, required: true },
  paystackRef:  { type: String, default: null },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked_in', 'checked_out', 'released', 'refunded', 'cancelled'],
    default: 'pending',
  },

  // Auto-refund if hotel doesn't confirm within 2hrs
  autoRefundAt: { type: Date },

  confirmedAt:  { type: Date, default: null },
  checkedInAt:  { type: Date, default: null },
  checkedOutAt: { type: Date, default: null },
  releasedAt:   { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('HotelBooking', HotelBookingSchema);
