const mongoose         = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const PropertySchema = new mongoose.Schema({
  // Core
  type:         { type: String, enum: ['land', 'rental', 'hotel'], required: true },
  title:        { type: String, required: true, trim: true },
  description:  { type: String, default: '' },
  status:          { type: String, enum: ['pending', 'approved', 'rejected', 'sold', 'rented'], default: 'pending' },
  rejectionReason: { type: String, default: '' },
  listedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Location
  address:      { type: String, default: '' },
  lga:          { type: String, default: '' },
  state:        { type: String, required: true },
  coordinates:  { lat: Number, lng: Number },

  // Media
  images:       [{ type: String }], // Cloudinary URLs
  video:        { type: String, default: '' },

  // Stats
  likes:        { type: Number, default: 0 },
  views:        { type: Number, default: 0 },

  // ─── LAND FIELDS ───
  price:        { type: Number },
  pricePerSqm:  { type: Number },
  size:         { type: String },           // e.g. "600sqm", "1 Plot"
  titleDoc:     { type: String },           // C of O, Survey Plan, None/Not yet
  zoning:       { type: String },           // Residential, Commercial, Not zoned yet
  landAmenities:[{ type: String }],

  // ─── RENTAL FIELDS ───
  rent:         { type: Number },
  bedrooms:     { type: Number },
  bathrooms:    { type: Number },
  furnishing:   { type: String },           // Unfurnished, Semi, Furnished
  rentalAmenities: [{ type: String }],
  availability: { type: String, enum: ['available', 'occupied', 'available_from'], default: 'available' },
  availableFrom:{ type: Date, default: null },
  fees: {
    agentFee:       { type: Number, default: 0 },
    cautionDeposit: { type: Number, default: 0 },
    legalFee:       { type: Number, default: 0 },
    serviceCharge:  { type: Number, default: 0 },
  },

  // ─── HOTEL FIELDS ───
  hotelName:    { type: String },
  rating:       { type: Number, default: 0 },
  reviewCount:  { type: Number, default: 0 },
  rooms: [{
    type:         { type: String },
    pricePerNight:{ type: Number },
    pricePerDay:  { type: Number },
    available:    { type: Boolean, default: true },
    amenities:    [{ type: String }],
  }],
  hotelAmenities: [{ type: String }],
  hotelRules:   { type: String, default: '' },
  bookedDates:  [{ type: String }],
  listerCommission: { type: Number, default: 0 },

  // ─── COMMENTS ───
  comments: [{
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text:      { type: String, required: true, trim: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
    replies: [{
      user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      text:      { type: String, required: true, trim: true, maxlength: 500 },
      createdAt: { type: Date, default: Date.now },
    }],
  }],

}, { timestamps: true });

// Text index for search
PropertySchema.index({ title: 'text', description: 'text', state: 'text', lga: 'text' });
PropertySchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Property', PropertySchema);
