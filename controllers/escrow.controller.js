const EscrowSession = require('../models/EscrowSession');
const Property      = require('../models/Property');
const User          = require('../models/User');
const Dispute       = require('../models/Dispute');
const { createEscrow, confirmEscrow, requestRelease, releaseFunds, refundEscrow, adminResolveFunds, PLATFORM_FEE_RATE } = require('../services/escrow.service');
const { sendNotification } = require('../services/notification.service');
const { emailTemplates }   = require('../services/email.service');
const { ok, fail }  = require('../utils/response');

// POST /api/escrow
const createSession = async (req, res) => {
  try {
    const { propertyId, amount } = req.body;
    const property = await Property.findById(propertyId).populate('listedBy');
    if (!property) return fail(res, 'Property not found.', 404);

    // Enforce flow: must have an agreed date before paying
    const Conversation = require('../models/Conversation');
    const Message      = require('../models/Message');

    let agreedConv = await Conversation.findOne({
      property:     propertyId,
      participants: req.user._id,
      visitStage:   'agreed',
    });

    if (!agreedConv) {
      // Fallback: visitStage may be stale — check if messages have an accepted date_proposal
      const conv = await Conversation.findOne({ property: propertyId, participants: req.user._id });
      if (conv) {
        const acceptedMsg = await Message.findOne({
          conversation:   conv._id,
          type:           'date_proposal',
          proposalStatus: 'accepted',
        });
        if (acceptedMsg) {
          // Heal the stale visitStage and allow payment
          await Conversation.findByIdAndUpdate(conv._id, { visitStage: 'agreed' });
          agreedConv = conv;
        }
      }
    }

    if (!agreedConv) {
      return fail(res, 'Please complete the inspection request flow first. Go to chat, request a visit, and agree on a date with the lister before paying.', 400);
    }

    // Determine escrow type from property type
    const escrowType = property.type === 'land' ? 'bush_entry'
                     : property.type === 'hotel' ? 'hotel_booking'
                     : 'inspection';

    const session = await createEscrow({
      seekerId:   req.user._id,
      listerId:   property.listedBy._id,
      propertyId,
      amount,
      escrowType,
      seekerUser: req.user,
      property,
    });

    const et1 = emailTemplates.escrowCreated(req.user.name, amount, property.title);
    await sendNotification({
      recipientId:     property.listedBy._id,
      recipientEmail:  property.listedBy.email,
      title:           'New Escrow Request',
      message:         `${req.user.name} has initiated an escrow session for "${property.title}".`,
      type:            'escrow',
      relatedEscrow:   session._id,
      relatedProperty: property._id,
      emailSubject:    et1.subject,
      emailHtml:       et1.html,
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

    const seeker = await User.findById(session.seeker).select('email');
    const et = emailTemplates.escrowConfirmed(req.user.name, new Date(inspectionDate).toDateString(), inspectionTime || '');
    await sendNotification({
      recipientId:    session.seeker,
      recipientEmail: seeker?.email,
      title:          'Inspection Confirmed',
      message:        `${req.user.name} confirmed the inspection date for your escrow session.`,
      type:           'escrow',
      relatedEscrow:  session._id,
      emailSubject:   et.subject,
      emailHtml:      et.html,
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

    const seekerUser = await User.findById(session.seeker).select('email');
    const populated  = await EscrowSession.findById(session._id).populate('property', 'title');
    const et = emailTemplates.paymentReleaseRequested(req.user.name, populated?.property?.title || 'your property');
    await sendNotification({
      recipientId:    session.seeker,
      recipientEmail: seekerUser?.email,
      title:          'Payment Release Requested',
      message:        `${req.user.name} is requesting payment release. Review and release funds if satisfied.`,
      type:           'payment',
      relatedEscrow:  session._id,
      emailSubject:   et.subject,
      emailHtml:      et.html,
    });

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

    const listerUser = await User.findById(session.lister).select('email');
    const et = emailTemplates.escrowReleased(listerAmount);
    await sendNotification({
      recipientId:    session.lister,
      recipientEmail: listerUser?.email,
      title:          'Funds Released',
      message:        `₦${listerAmount.toLocaleString()} has been released to your wallet after platform fee.`,
      type:           'payment',
      relatedEscrow:  session._id,
      emailSubject:   et.subject,
      emailHtml:      et.html,
    });

    return ok(res, { ...result }, `Funds released. Lister receives ₦${listerAmount.toLocaleString()} after 10% platform fee.`);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// PUT /api/escrow/:id/refund
const refund = async (req, res) => {
  try {
    const session = await EscrowSession.findById(req.params.id);
    await refundEscrow(req.params.id, 'Admin/Manual refund');

    if (session) {
      const seekerUser = await User.findById(session.seeker).select('email');
      const et = emailTemplates.escrowRefunded(session.amount || 0);
      await sendNotification({
        recipientId:    session.seeker,
        recipientEmail: seekerUser?.email,
        title:          'Escrow Refunded',
        message:        `Your escrow funds of ₦${session.amount?.toLocaleString()} have been refunded to your wallet.`,
        type:           'payment',
        relatedEscrow:  session._id,
        emailSubject:   et.subject,
        emailHtml:      et.html,
      });
    }

    return ok(res, {}, 'Escrow refunded.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// POST /api/escrow/:id/dispute
const dispute = async (req, res) => {
  try {
    const { reason, evidence } = req.body;
    const session = await EscrowSession.findByIdAndUpdate(
      req.params.id,
      { status: 'disputed', disputeReason: reason, disputedAt: new Date() },
      { new: true }
    );

    if (!session) return fail(res, 'Session not found.', 404);

    // Determine who the other party is
    const isSeeker   = session.seeker.toString() === req.user._id.toString();
    const otherParty = isSeeker ? session.lister : session.seeker;

    // Create a Dispute document so admin can act on it
    const disputeDoc = await Dispute.create({
      raisedBy: req.user._id,
      against:  otherParty,
      escrow:   session._id,
      reason:   reason || 'No reason provided.',
      evidence: Array.isArray(evidence) ? evidence : [],
    });

    await sendNotification({
      recipientId:   otherParty,
      title:         'Dispute Raised',
      message:       `${req.user.name} has raised a dispute on your escrow session. Admin will review.`,
      type:          'dispute',
      relatedEscrow: session._id,
    });

    return ok(res, { session, dispute: disputeDoc }, 'Dispute raised. Admin will review.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// PUT /api/escrow/:id/log-visit  — lister marks a physical inspection visit done
const MAX_VISITS = 3;
const logVisit = async (req, res) => {
  try {
    const { note = '' } = req.body;
    const session = await EscrowSession.findById(req.params.id).populate('seeker property');
    if (!session) return fail(res, 'Session not found.', 404);
    if (session.lister.toString() !== req.user._id.toString()) return fail(res, 'Only the lister can log a visit.', 403);
    if (['released', 'refunded', 'resolved'].includes(session.status)) return fail(res, 'Session is already closed.', 400);

    const newVisitCount = (session.visitCount || 0) + 1;
    const updates = {
      visitCount:  newVisitCount,
      inspectedAt: new Date(),
      $push: { visitLog: { visitedAt: new Date(), note: note.trim() } },
    };

    // Move to in_progress on first visit if still confirmed/pending
    if (['pending', 'confirmed'].includes(session.status)) {
      updates.status = 'in_progress';
    }

    // After 3 visits, auto-request payment so seeker must release
    if (newVisitCount >= MAX_VISITS) {
      updates.status = 'payment_requested';
    }

    const updated = await EscrowSession.findByIdAndUpdate(req.params.id, updates, { new: true }).populate('seeker property');

    // Notify seeker
    const visitMsg = newVisitCount >= MAX_VISITS
      ? `${req.user.name} has completed 3 inspection visits for "${updated.property?.title}". Please release the inspection fee.`
      : `${req.user.name} has logged visit ${newVisitCount} of ${MAX_VISITS} for "${updated.property?.title}".`;

    await sendNotification({
      recipientId:    session.seeker._id,
      recipientEmail: session.seeker?.email,
      title:          newVisitCount >= MAX_VISITS ? '3 Inspections Done — Release Fee' : `Inspection Visit ${newVisitCount} Logged`,
      message:        visitMsg,
      type:           'escrow',
      relatedEscrow:  session._id,
      relatedProperty: session.property?._id,
    });

    return ok(res, { session: updated }, `Visit ${newVisitCount} logged.${newVisitCount >= MAX_VISITS ? ' Seeker notified to release fee.' : ''}`);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

module.exports = { createSession, getSession, getMySessions, confirm, requestPayment, release, refund, dispute, logVisit };
