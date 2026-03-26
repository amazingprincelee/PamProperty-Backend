const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: ['text', 'date_proposal', 'image', 'video', 'document'], default: 'text' },
  text:         { type: String, default: '' },

  // Attachment (image / video / document)
  attachmentUrl:  { type: String, default: null },
  attachmentName: { type: String, default: null },
  attachmentSize: { type: Number, default: null }, // bytes

  // Date proposal card
  proposedDate: { type: Date, default: null },
  proposedTime: { type: String, default: null },
  proposedNote: { type: String, default: null },
  proposalStatus: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },

  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
