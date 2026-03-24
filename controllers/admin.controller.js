const Property  = require('../models/Property');
const User      = require('../models/User');
const Dispute   = require('../models/Dispute');
const { sendNotification } = require('../services/notification.service');
const { emailTemplates }   = require('../services/email.service');
const { refundEscrow }     = require('../services/escrow.service');
const { ok, fail } = require('../utils/response');

// GET /api/admin/properties — pending queue
const getPendingProperties = async (req, res) => {
  try {
    const properties = await Property.find({ status: 'pending' })
      .populate('listedBy', 'name email')
      .sort({ createdAt: 1 });
    return ok(res, { properties });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/properties/:id/approve
const approveProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id, { status: 'approved' }, { new: true }
    ).populate('listedBy', 'name email');

    const et = emailTemplates.listingApproved(property.title);
    await sendNotification({
      recipientId:     property.listedBy._id,
      recipientEmail:  property.listedBy.email,
      title:           'Listing Approved',
      message:         `Your listing "${property.title}" has been approved and is now live.`,
      type:            'listing',
      relatedProperty: property._id,
      emailSubject:    et.subject,
      emailHtml:       et.html,
    });

    return ok(res, { property }, 'Property approved.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/properties/:id/reject
const rejectProperty = async (req, res) => {
  try {
    const { reason } = req.body;
    const property = await Property.findByIdAndUpdate(
      req.params.id, { status: 'rejected' }, { new: true }
    ).populate('listedBy', 'name email');

    const et = emailTemplates.listingRejected(property.title, reason);
    await sendNotification({
      recipientId:     property.listedBy._id,
      recipientEmail:  property.listedBy.email,
      title:           'Listing Rejected',
      message:         `Your listing "${property.title}" was rejected. Reason: ${reason || 'Does not meet requirements.'}`,
      type:            'listing',
      relatedProperty: property._id,
      emailSubject:    et.subject,
      emailHtml:       et.html,
    });

    return ok(res, { property }, 'Property rejected.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return ok(res, { users });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/users/:id/kyc
const approveKyc = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { kycVerified: true }, { new: true }).select('-password');
    const et = emailTemplates.kycApproved(user.name);
    await sendNotification({
      recipientId:    user._id,
      recipientEmail: user.email,
      title:          'KYC Verified',
      message:        'Your identity has been verified. You can now list properties.',
      type:           'system',
      emailSubject:   et.subject,
      emailHtml:      et.html,
    });
    return ok(res, { user }, 'KYC approved.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/admin/disputes
const getDisputes = async (req, res) => {
  try {
    const disputes = await Dispute.find()
      .populate('raisedBy against', 'name email')
      .populate('escrow hotelBooking')
      .sort({ createdAt: -1 });
    return ok(res, { disputes });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/disputes/:id/resolve
const resolveDispute = async (req, res) => {
  try {
    const { resolution, adminNote } = req.body; // 'seeker' or 'lister'
    const dispute = await Dispute.findById(req.params.id).populate('escrow');
    if (!dispute) return fail(res, 'Dispute not found.', 404);

    if (resolution === 'seeker' && dispute.escrow) {
      await refundEscrow(dispute.escrow._id, 'Admin resolved – refunded to seeker');
    }

    await Dispute.findByIdAndUpdate(req.params.id, {
      status:     `resolved_${resolution}`,
      adminNote,
      resolvedAt: new Date(),
    });

    return ok(res, {}, 'Dispute resolved.');
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getPendingProperties, approveProperty, rejectProperty, getAllUsers, approveKyc, getDisputes, resolveDispute };
