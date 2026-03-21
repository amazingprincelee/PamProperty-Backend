const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  property:     { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // [seeker, lister]
  lastMessage:  { type: String, default: '' },
  lastTime:     { type: Date, default: Date.now },
  unreadCount:  { type: Map, of: Number, default: {} }, // { userId: unreadCount }
}, { timestamps: true });

module.exports = mongoose.model('Conversation', ConversationSchema);
