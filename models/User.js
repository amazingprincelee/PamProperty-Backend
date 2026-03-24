const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:       { type: String, select: false }, // null for Google-only accounts
  phone:          { type: String, default: '' },
  avatar:         { type: String, default: '' },
  role:           { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },

  // Auth
  googleId:       { type: String, default: null },
  isGoogleUser:   { type: Boolean, default: false },

  // KYC
  kycVerified:        { type: Boolean, default: false },
  kycStatus:          { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  kycDocuments:       [{ type: String }], // Cloudinary URLs
  kycRejectionReason: { type: String, default: '' },
  kycSubmittedAt:     { type: Date, default: null },

  // Social
  following:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followers:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedProperties:[{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],

  // Referral
  referralCode:   { type: String, unique: true },

  // Notifications preferences
  emailNotifs:    { type: Boolean, default: true },
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Generate referral code before save
UserSchema.pre('save', function (next) {
  if (!this.referralCode) {
    const initials = this.name.slice(0, 2).toUpperCase();
    this.referralCode = `PROP-${initials}-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
