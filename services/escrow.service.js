const EscrowSession  = require('../models/EscrowSession');
const { debitWallet, internalCredit } = require('./payment.service');
const { sendNotification }            = require('./notification.service');
const { sendEmail, emailTemplates }   = require('./email.service');

const PLATFORM_FEE_RATE = 0.10; // 10%

/* ─────────────────────────────────────────────
   CREATE ESCROW SESSION
───────────────────────────────────────────── */
const createEscrow = async ({ seekerId, listerId, propertyId, amount, seekerUser, property }) => {
  // Debit seeker wallet
  await debitWallet({
    userId:          seekerId,
    amount,
    description:     `Escrow deposit – ${property.title}`,
    category:        'escrow_hold',
    relatedProperty: propertyId,
  });

  const autoRefundDate = new Date();
  autoRefundDate.setDate(autoRefundDate.getDate() + 7); // 7 days to confirm

  const session = await EscrowSession.create({
    seeker:          seekerId,
    lister:          listerId,
    property:        propertyId,
    amount,
    status:          'pending',
    autoRefundDate,
  });

  // Notify lister
  await sendNotification({
    recipientId:     listerId,
    title:           'New Inspection Request',
    message:         `${seekerUser.name} has placed an escrow deposit for ${property.title}. Confirm to proceed.`,
    type:            'escrow',
    relatedEscrow:   session._id,
    relatedProperty: propertyId,
  });

  return session;
};

/* ─────────────────────────────────────────────
   CONFIRM ESCROW (lister confirms inspection date)
───────────────────────────────────────────── */
const confirmEscrow = async ({ sessionId, inspectionDate, inspectionTime, inspectionNote, listerUser }) => {
  const autoReleaseDate = new Date(inspectionDate);
  autoReleaseDate.setDate(autoReleaseDate.getDate() + 14); // 14 days after inspection

  const session = await EscrowSession.findByIdAndUpdate(
    sessionId,
    {
      status:          'confirmed',
      inspectionDate,
      inspectionTime,
      inspectionNote,
      confirmedAt:     new Date(),
      autoReleaseDate,
    },
    { new: true }
  ).populate('property seeker');

  // Notify seeker
  await sendNotification({
    recipientId:   session.seeker._id,
    title:         'Inspection Confirmed',
    message:       `${listerUser.name} confirmed your inspection for ${new Date(inspectionDate).toDateString()} at ${inspectionTime}.`,
    type:          'escrow',
    relatedEscrow: session._id,
  });

  await sendEmail({
    to:      session.seeker.email,
    ...emailTemplates.escrowConfirmed(listerUser.name, new Date(inspectionDate).toDateString(), inspectionTime),
  });

  return session;
};

/* ─────────────────────────────────────────────
   REQUEST PAYMENT RELEASE (lister requests)
───────────────────────────────────────────── */
const requestRelease = async ({ sessionId, listerUser }) => {
  const session = await EscrowSession.findByIdAndUpdate(
    sessionId,
    { status: 'payment_requested' },
    { new: true }
  ).populate('seeker property');

  await sendNotification({
    recipientId:   session.seeker._id,
    title:         'Payment Release Requested',
    message:       `${listerUser.name} has requested payment release for ${session.property.title}. Approve to release funds.`,
    type:          'escrow',
    relatedEscrow: session._id,
  });

  return session;
};

/* ─────────────────────────────────────────────
   RELEASE FUNDS (seeker approves)
───────────────────────────────────────────── */
const releaseFunds = async ({ sessionId, seekerUser }) => {
  const session = await EscrowSession.findById(sessionId).populate('lister property');
  if (!session) throw new Error('Session not found.');
  if (session.status !== 'payment_requested') throw new Error('Release not yet requested.');

  const platformFee  = Math.round(session.amount * PLATFORM_FEE_RATE);
  const listerAmount = session.amount - platformFee;

  // Credit lister wallet (minus platform fee)
  await internalCredit({
    userId:        session.lister._id,
    amount:        listerAmount,
    description:   `Escrow released – ${session.property.title}`,
    category:      'escrow_release',
    relatedEscrow: session._id,
  });

  await EscrowSession.findByIdAndUpdate(sessionId, { status: 'released', resolvedAt: new Date() });

  // Notify lister
  await sendNotification({
    recipientId:   session.lister._id,
    title:         'Funds Released',
    message:       `₦${listerAmount.toLocaleString()} has been released to your wallet (₦${platformFee.toLocaleString()} platform fee deducted).`,
    type:          'payment',
    relatedEscrow: session._id,
  });

  await sendEmail({
    to: session.lister.email,
    ...emailTemplates.escrowReleased(listerAmount),
  });

  return { listerAmount, platformFee };
};

/* ─────────────────────────────────────────────
   REFUND (auto or admin-triggered)
───────────────────────────────────────────── */
const refundEscrow = async (sessionId, reason = 'Auto-refund') => {
  const session = await EscrowSession.findById(sessionId).populate('seeker property');
  if (!session || session.status === 'released' || session.status === 'refunded') return;

  await internalCredit({
    userId:        session.seeker._id,
    amount:        session.amount,
    description:   `Escrow refund – ${session.property?.title || 'Property'} (${reason})`,
    category:      'escrow_refund',
    relatedEscrow: session._id,
  });

  await EscrowSession.findByIdAndUpdate(sessionId, { status: 'refunded', resolvedAt: new Date() });

  await sendNotification({
    recipientId:   session.seeker._id,
    title:         'Escrow Refunded',
    message:       `₦${session.amount.toLocaleString()} has been refunded to your wallet.`,
    type:          'payment',
    relatedEscrow: session._id,
  });

  await sendEmail({
    to: session.seeker.email,
    ...emailTemplates.escrowRefunded(session.amount),
  });
};

module.exports = { createEscrow, confirmEscrow, requestRelease, releaseFunds, refundEscrow, PLATFORM_FEE_RATE };
