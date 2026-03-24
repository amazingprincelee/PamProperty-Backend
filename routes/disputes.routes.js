const router  = require('express').Router();
const Dispute = require('../models/Dispute');
const { sendNotification } = require('../services/notification.service');
const { ok, fail } = require('../utils/response');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET /api/disputes/:id — get a single dispute
router.get('/:id', async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate('raisedBy against resolvedBy', 'name email avatar')
      .populate({ path: 'escrow', populate: { path: 'property', select: 'title' } });
    if (!dispute) return fail(res, 'Dispute not found.', 404);
    // Only involved parties can see this
    const uid = req.user._id.toString();
    const isParty = [dispute.raisedBy._id.toString(), dispute.against._id.toString()].includes(uid);
    if (!isParty) return fail(res, 'Not authorised.', 403);
    return ok(res, { dispute });
  } catch (err) {
    return fail(res, err.message);
  }
});

// PUT /api/disputes/:id/counter — submit counter-statement
router.put('/:id/counter', async (req, res) => {
  try {
    const { counterStatement } = req.body;
    if (!counterStatement?.trim()) return fail(res, 'Counter statement is required.', 400);

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return fail(res, 'Dispute not found.', 404);
    if (dispute.against.toString() !== req.user._id.toString()) {
      return fail(res, 'Only the respondent can submit a counter statement.', 403);
    }
    if (dispute.counterStatement) return fail(res, 'Counter statement already submitted.', 400);

    const updated = await Dispute.findByIdAndUpdate(
      req.params.id,
      {
        counterStatement:   counterStatement.trim(),
        counterSubmittedAt: new Date(),
        status:             'under_review',
      },
      { new: true }
    ).populate('raisedBy against', 'name email');

    await sendNotification({
      recipientId: dispute.raisedBy,
      title:       'Counter Statement Submitted',
      message:     `${req.user.name} has submitted a response to your dispute. Admin is now reviewing both sides.`,
      type:        'dispute',
    });

    return ok(res, { dispute: updated }, 'Counter statement submitted.');
  } catch (err) {
    return fail(res, err.message);
  }
});

// GET /api/disputes/my — disputes involving the current user
router.get('/', async (req, res) => {
  try {
    const disputes = await Dispute.find({
      $or: [{ raisedBy: req.user._id }, { against: req.user._id }],
    })
      .populate('raisedBy against', 'name email avatar')
      .populate({ path: 'escrow', populate: { path: 'property', select: 'title' } })
      .sort({ createdAt: -1 });
    return ok(res, { disputes });
  } catch (err) {
    return fail(res, err.message);
  }
});

module.exports = router;
