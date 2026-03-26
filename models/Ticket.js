const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole:{ type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
  message:   { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const TicketSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject:    { type: String, required: true, trim: true },
  category:   { type: String, enum: ['payment', 'listing', 'account', 'technical', 'other'], default: 'other' },
  message:    { type: String, required: true, trim: true },
  status:     { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  priority:   { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  replies:    [ReplySchema],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Ticket', TicketSchema);
