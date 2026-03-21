const EscrowSession = require('../models/EscrowSession');
const Property      = require('../models/Property');
const { createEscrow, confirmEscrow, requestRelease, releaseFunds, refundEscrow, PLATFORM_FEE_RATE } = require('../services/escrow.service');
const { ok, fail }  = require('../utils/response');

// POST /api/escrow
const createSession = async (req, res) => {
  try {
    const { propertyId, amount } = req.body;
    const property = await Property.findById(propertyId).populate('listedBy');
    if (!property) return fail(res, 'Property not found.', 404);

    const session = await createEscrow({
      seekerId:   req.user._id,
      listerId:   property.listedBy._id,
      propertyId,
      amount,
      seekerUser: req.user,
      property,
    });

    return ok(res, { session }, 'Escrow session created.', 201);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// GET /api/escrow/:id
const getSession = async (req, res) => {
  try {
    const session = await EscrowSession.findById(req.params.id)
      .populate('seeker lister property');
    if (!session) return fail(res, 'Session not found.', 404);
    return ok(res, { session });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/escrow/my
const getMySessions = async (req, res) => {
  try {
    const sessions = await EscrowSession.find({
      $or: [{ seeker: req.user._id }, { lister: req.user._id }],
    }).populate('seeker lister property').sort({ createdAt: -1 });
    return ok(res, { sessions });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/escrow/:id/confirm
const confirm = async (req, res) => {
  try {
    const { inspectionDate, inspectionTime, inspectionNote } = req.body;
    const session = await confirmEscrow({
      sessionId:      req.params.id,
      inspectionDate,
      inspectionTime,
      inspectionNote,
      listerUser:     req.user,
    });
    return ok(res, { session }, 'Inspection confirmed.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// PUT /api/escrow/:id/request-payment
const requestPayment = async (req, res) => {
  try {
    const session = await requestRelease({ sessionId: req.params.id, listerUser: req.user });
    return ok(res, { session }, 'Payment release requested.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// PUT /api/escrow/:id/release
const release = async (req, res) => {
  try {
    const session = await EscrowSession.findById(req.params.id);
    if (!session) return fail(res, 'Session not found.', 404);
    if (session.seeker.toString() !== req.user._id.toString()) return fail(res, 'Not authorised.', 403);

    const platformFee  = Math.round(session.amount * PLATFORM_FEE_RATE);
    const listerAmount = session.amount - platformFee;

    const result = await releaseFunds({ sessionId: req.params.id, seekerUser: req.user });
    return ok(res, { ...result }, `Funds released. Lister receives ₦${listerAmount.toLocaleString()} after 10% platform fee.`);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// PUT /api/escrow/:id/refund
const refund = async (req, res) => {
  try {
    await refundEscrow(req.params.id, 'Admin/Manual refund');
    return ok(res, {}, 'Escrow refunded.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// POST /api/escrow/:id/dispute
const dispute = async (req, res) => {
  try {
    const { reason } = req.body;
    const session = await EscrowSession.findByIdAndUpdate(
      req.params.id,
      { status: 'disputed', disputeReason: reason, disputedAt: new Date() },
      { new: true }
    );
    return ok(res, { session }, 'Dispute raised. Admin will review.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

module.exports = { createSession, getSession, getMySessions, confirm, requestPayment, release, refund, dispute };
