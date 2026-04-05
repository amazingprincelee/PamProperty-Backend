const mongoose = require('mongoose');

const PlatformSettingsSchema = new mongoose.Schema({
  key:   { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
}, { timestamps: true });

// Helper: get a setting value by key (with fallback)
PlatformSettingsSchema.statics.get = async function (key, fallback = null) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : fallback;
};

// Helper: set a setting value
PlatformSettingsSchema.statics.set = async function (key, value) {
  return this.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
};

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);
