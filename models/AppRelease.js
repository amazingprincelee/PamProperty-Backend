const mongoose = require('mongoose');

const AppReleaseSchema = new mongoose.Schema({
  version:      { type: String, required: true },
  releaseNotes: { type: String, default: '' },
  downloadUrl:  { type: String, default: '' },
  isCritical:   { type: Boolean, default: false },
  sentBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tokenCount:   { type: Number, default: 0 },
  failCount:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('AppRelease', AppReleaseSchema);
