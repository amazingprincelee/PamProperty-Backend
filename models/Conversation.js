const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  property:     { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // [seeker, lister]
  lastMessage:  { type: String, default: '' },
  lastTime:     { type: Date, default: Date.now },
  unreadCount:  { type: Map, of: Number, default: {} },
  visitStage:   { type: String, enum: ['requested', 'proposed', 'agreed'], default: null },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', ConversationSchema);
