const mongoose = require('mongoose');

// Tracks unique property views to prevent inflation
// One record per (property + user) or (property + ip) within a 24-hour window
const PropertyViewSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ip:       { type: String, default: null },
  viewedAt: { type: Date, default: Date.now },
});

// Auto-delete records after 24 hours so the same user/ip counts again next day
PropertyViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 86400 });

// Compound index for fast duplicate lookup
PropertyViewSchema.index({ property: 1, user: 1 });
PropertyViewSchema.index({ property: 1, ip: 1 });

module.exports = mongoose.model('PropertyView', PropertyViewSchema);
