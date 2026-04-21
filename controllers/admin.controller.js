const Property  = require('../models/Property');
const User      = require('../models/User');
const Dispute   = require('../models/Dispute');
const { sendNotification }  = require('../services/notification.service');
const { emailTemplates }    = require('../services/email.service');
const { refundEscrow, adminResolveFunds } = require('../services/escrow.service');
const { ok, fail } = require('../utils/response');

/* ─── LISTINGS ─────────────────────────────── */

// GET /api/admin/properties
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

    if (!property) return fail(res, 'Property not found.', 404);

    const et = emailTemplates.listingApproved(property.listedBy.name, property.title);
    await sendNotification({
      recipientId:     property.listedBy._id,
      recipientEmail:  property.listedBy.email,
      title:           'Listing Approved',
      message:         `Your listing "${property.title}" has been approved and is now live.`,
      type:            'listing_approved',
      relatedProperty: property._id,
      emailSubject:    et.subject,
      emailHtml:       et.html,
      whatsappEnabled: true,
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
      req.params.id, { status: 'rejected', rejectionReason: reason || '' }, { new: true }
    ).populate('listedBy', 'name email');

    if (!property) return fail(res, 'Property not found.', 404);

    const et = emailTemplates.listingRejected(property.listedBy.name, property.title, reason);
    await sendNotification({
      recipientId:     property.listedBy._id,
      recipientEmail:  property.listedBy.email,
      title:           'Listing Rejected',
      message:         `Your listing "${property.title}" was rejected. Reason: ${reason || 'Does not meet requirements.'}`,
      type:            'listing_rejected',
      relatedProperty: property._id,
      emailSubject:    et.subject,
      emailHtml:       et.html,
      whatsappEnabled: true,
    });

    return ok(res, { property }, 'Property rejected.');
  } catch (err) {
    return fail(res, err.message);
  }
};

/* ─── USERS ─────────────────────────────────── */

// GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { search, role, kycStatus } = req.query;
    const filter = {};
    if (role)      filter.role      = role;
    if (kycStatus) filter.kycStatus = kycStatus;
    if (search)    filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    return ok(res, { users });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/users/:id/role  (super_admin only)
const changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin', 'super_admin'].includes(role)) return fail(res, 'Invalid role.', 400);
    if (req.params.id === req.user._id.toString()) return fail(res, 'Cannot change your own role.', 400);

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return fail(res, 'User not found.', 404);

    await sendNotification({
      recipientId: user._id,
      title:       'Account Role Updated',
      message:     `Your account role has been updated to ${role.replace('_', ' ')}.`,
      type:        'system',
    });

    return ok(res, { user }, `User role updated to ${role}.`);
  } catch (err) {
    return fail(res, err.message);
  }
};

/* ─── KYC ────────────────────────────────────── */

// GET /api/admin/kyc
const getKycQueue = async (req, res) => {
  try {
    const users = await User.find({ kycStatus: 'pending' })
      .select('-password')
      .sort({ kycSubmittedAt: 1 });
    return ok(res, { users });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/kyc/:userId/review
const reviewKyc = async (req, res) => {
  try {
    const { verdict, rejectionReason } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(verdict)) return fail(res, 'Invalid verdict.', 400);

    const updates = { kycStatus: verdict };
    if (verdict === 'approved') {
      updates.kycVerified = true;
      updates.kycRejectionReason = '';
    } else {
      updates.kycVerified = false;
      updates.kycRejectionReason = rejectionReason || 'Documents do not meet requirements.';
    }

    const user = await User.findByIdAndUpdate(req.params.userId, updates, { new: true }).select('-password');
    if (!user) return fail(res, 'User not found.', 404);

    if (verdict === 'approved') {
      const et = emailTemplates.kycApproved(user.name);
      await sendNotification({
        recipientId:     user._id,
        recipientEmail:  user.email,
        title:           'KYC Verified',
        message:         'Your identity has been verified. You can now list properties.',
        type:            'kyc',
        emailSubject:    et.subject,
        emailHtml:       et.html,
        whatsappEnabled: true,
      });
    } else {
      await sendNotification({
        recipientId:     user._id,
        title:           'KYC Rejected',
        message:         `Your KYC submission was rejected. Reason: ${updates.kycRejectionReason}`,
        type:            'kyc',
        whatsappEnabled: true,
      });
    }

    return ok(res, { user }, `KYC ${verdict}.`);
  } catch (err) {
    return fail(res, err.message);
  }
};

/* ─── DISPUTES ───────────────────────────────── */

// GET /api/admin/disputes
const getDisputes = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const disputes = await Dispute.find(filter)
      .populate('raisedBy against', 'name email avatar')
      .populate('resolvedBy', 'name')
      .populate({ path: 'escrow', populate: { path: 'property', select: 'title' } })
      .sort({ createdAt: -1 });
    return ok(res, { disputes });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/disputes/:id/resolve
const resolveDispute = async (req, res) => {
  try {
    const { resolutionType, splitPercent, adminNote } = req.body;
    if (!['refund_seeker', 'pay_lister', 'split'].includes(resolutionType)) {
      return fail(res, 'Invalid resolution type.', 400);
    }

    const dispute = await Dispute.findById(req.params.id).populate('escrow raisedBy against');
    if (!dispute) return fail(res, 'Dispute not found.', 404);

    // Execute fund movement
    if (dispute.escrow) {
      await adminResolveFunds({
        sessionId:      dispute.escrow._id,
        resolutionType,
        splitPercent:   splitPercent ?? 50,
        adminNote,
      });
    }

    await Dispute.findByIdAndUpdate(req.params.id, {
      status:         'resolved',
      resolutionType,
      splitPercent:   resolutionType === 'split' ? (splitPercent ?? 50) : null,
      adminNote:      adminNote || '',
      resolvedBy:     req.user._id,
      resolvedAt:     new Date(),
    });

    // Notify both parties
    const msg = resolutionType === 'refund_seeker'
      ? 'Admin has resolved the dispute in favour of the seeker. Your funds have been refunded.'
      : resolutionType === 'pay_lister'
      ? 'Admin has resolved the dispute in favour of the lister. Funds have been released.'
      : `Admin has resolved the dispute with a ${splitPercent ?? 50}/${100 - (splitPercent ?? 50)} split.`;

    await sendNotification({ recipientId: dispute.raisedBy._id, title: 'Dispute Resolved', message: msg, type: 'dispute', whatsappEnabled: true });
    await sendNotification({ recipientId: dispute.against._id,  title: 'Dispute Resolved', message: msg, type: 'dispute', whatsappEnabled: true });

    return ok(res, {}, 'Dispute resolved.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/disputes/:id/request-info
const requestDisputeInfo = async (req, res) => {
  try {
    const { fromUserId, note, deadline } = req.body;
    const dispute = await Dispute.findByIdAndUpdate(
      req.params.id,
      {
        status:            'awaiting_response',
        infoRequestedFrom: fromUserId,
        infoRequestNote:   note || '',
        infoDeadline:      deadline ? new Date(deadline) : null,
      },
      { new: true }
    ).populate('raisedBy against', 'name email');

    if (!dispute) return fail(res, 'Dispute not found.', 404);

    await sendNotification({
      recipientId: fromUserId,
      title:       'Admin Needs More Information',
      message:     note || 'Admin has requested additional information regarding your dispute.',
      type:        'dispute',
    });

    return ok(res, { dispute }, 'Information request sent.');
  } catch (err) {
    return fail(res, err.message);
  }
};

/* ─── ANALYTICS ──────────────────────────────── */

// GET /api/admin/analytics
const getAnalytics = async (req, res) => {
  try {
    const [totalUsers, totalProperties, pendingProps, kycPending, openDisputes] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments({ status: 'approved' }),
      Property.countDocuments({ status: 'pending' }),
      User.countDocuments({ kycStatus: 'pending' }),
      Dispute.countDocuments({ status: { $in: ['open', 'under_review', 'awaiting_response'] } }),
    ]);

    return ok(res, { analytics: { totalUsers, totalProperties, pendingProps, kycPending, openDisputes } });
  } catch (err) {
    return fail(res, err.message);
  }
};

/* ─── APP RELEASE / BROADCAST ──────────────── */

// POST /api/admin/broadcast-update
const broadcastUpdate = async (req, res) => {
  try {
    const { version, releaseNotes, downloadUrl, isCritical, confirmKey } = req.body;

    if (confirmKey !== 'newupdate') return fail(res, 'Invalid confirmation key.', 403);
    if (!version?.trim())           return fail(res, 'Version number is required.');

    const users  = await User.find({ fcmToken: { $ne: null } }).select('fcmToken').lean();
    const tokens = users.map(u => u.fcmToken).filter(Boolean);

    const { sendMulticast } = require('../services/push.service');
    const { successCount, failureCount } = await sendMulticast({
      tokens,
      title: `🚀 PamProperty ${version} is here!`,
      body:  isCritical
        ? 'A critical update is required. Please update now to continue using the app.'
        : (releaseNotes?.split('\n')[0] || 'A new version of PamProperty is available. Tap to update.'),
      data: {
        type:         'app_update',
        version,
        releaseNotes: releaseNotes || '',
        downloadUrl:  downloadUrl  || '',
        isCritical:   String(!!isCritical),
      },
    });

    const AppRelease = require('../models/AppRelease');
    const release = await AppRelease.create({
      version: version.trim(),
      releaseNotes,
      downloadUrl,
      isCritical: !!isCritical,
      sentBy:     req.user._id,
      tokenCount: successCount,
      failCount:  failureCount,
    });

    // Real-time: push to all currently connected sockets instantly
    try {
      const { getIO } = require('../config/socket');
      getIO().emit('app_update', {
        type:         'app_update',
        version,
        releaseNotes: releaseNotes || '',
        downloadUrl:  downloadUrl  || '',
        isCritical:   !!isCritical,
      });
    } catch { /* socket may not be initialised in test env */ }

    return ok(res, { release, successCount, failureCount }, `Broadcast sent to ${successCount} device(s).`);
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/admin/releases
const getReleases = async (req, res) => {
  try {
    const AppRelease = require('../models/AppRelease');
    const releases = await AppRelease.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('sentBy', 'name');
    return ok(res, { releases });
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = {
  getPendingProperties, approveProperty, rejectProperty,
  getAllUsers, changeUserRole,
  getKycQueue, reviewKyc,
  getDisputes, resolveDispute, requestDisputeInfo,
  getAnalytics,
  broadcastUpdate, getReleases,
};
