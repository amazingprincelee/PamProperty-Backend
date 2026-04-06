const Review        = require('../models/Review');
const Property      = require('../models/Property');
const EscrowSession = require('../models/EscrowSession');
const { ok, fail }  = require('../utils/response');

// GET /api/properties/:id/reviews
const getReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ property: req.params.id })
      .populate('reviewer', 'name avatar kycVerified')
      .sort({ createdAt: -1 });
    return ok(res, { reviews });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties/:id/reviews  (auth required)
const submitReview = async (req, res) => {
  try {
    const { rating, comment, escrowSessionId } = req.body;
    const propertyId = req.params.id;
    const reviewerId = req.user._id;

    if (!rating || rating < 1 || rating > 5) return fail(res, 'Rating must be between 1 and 5.', 400);

    // Verify the escrow session: must belong to this user, this property, and be released
    const session = await EscrowSession.findOne({
      _id:      escrowSessionId,
      seeker:   reviewerId,
      property: propertyId,
      status:   'released',
    });
    if (!session) return fail(res, 'You can only review properties you have completed an inspection for.', 403);

    // Check not already reviewed
    const existing = await Review.findOne({ property: propertyId, reviewer: reviewerId });
    if (existing) return fail(res, 'You have already reviewed this property.', 400);

    const review = await Review.create({
      property:      propertyId,
      reviewer:      reviewerId,
      escrowSession: escrowSessionId,
      rating,
      comment: (comment || '').trim(),
    });

    // Recalculate average rating on Property
    const all = await Review.find({ property: propertyId });
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    await Property.findByIdAndUpdate(propertyId, {
      rating:      Math.round(avg * 10) / 10,
      reviewCount: all.length,
    });

    await review.populate('reviewer', 'name avatar kycVerified');
    return ok(res, { review }, 'Review submitted.');
  } catch (err) {
    if (err.code === 11000) return fail(res, 'You have already reviewed this property.', 400);
    return fail(res, err.message);
  }
};

// GET /api/properties/:id/reviews/eligibility  (auth required)
// Returns whether the user can review + which escrow session to attach
const checkEligibility = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const reviewerId = req.user._id;

    const session = await EscrowSession.findOne({
      seeker:   reviewerId,
      property: propertyId,
      status:   'released',
    });

    const alreadyReviewed = !!(await Review.findOne({ property: propertyId, reviewer: reviewerId }));

    return ok(res, {
      canReview:       !!session && !alreadyReviewed,
      alreadyReviewed,
      escrowSessionId: session?._id || null,
    });
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getReviews, submitReview, checkEligibility };
