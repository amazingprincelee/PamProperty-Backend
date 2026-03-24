const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:     { type: String, required: true },
  message:   { type: String, required: true },
  type:      {
    type: String,
    enum: ['escrow', 'booking', 'message', 'payment', 'listing', 'system', 'availability',
           'listing_approved', 'listing_rejected', 'dispute', 'kyc', 'follow'],
    default: 'system',
  },
  read:      { type: Boolean, default: false },

  // Deep link context
  relatedEscrow:       { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowSession', default: null },
  relatedHotelBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelBooking',  default: null },
  relatedProperty:     { type: mongoose.Schema.Types.ObjectId, ref: 'Property',      default: null },
  relatedConversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation',  default: null },
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
