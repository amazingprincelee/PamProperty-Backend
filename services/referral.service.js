const User            = require('../models/User');
const Transaction     = require('../models/Transaction');
const PlatformSettings = require('../models/PlatformSettings');

/**
 * Credit referrer bonus when a lister receives their inspection/bush-entry fee.
 * @param {ObjectId} listerId   — the agent/lister who received the fee
 * @param {number}   systemCut  — the ₦ amount kept by the system from this transaction
 * @param {ObjectId} relatedEscrow — the escrow session for transaction linkage
 */
const creditReferrerBonus = async ({ listerId, systemCut, relatedEscrow }) => {
  const lister = await User.findById(listerId).select('referredBy name');
  if (!lister?.referredBy) return null; // Not referred — system keeps full cut

  const referrer = await User.findById(lister.referredBy).select('_id name');
  if (!referrer) return null;

  // Referrer bonus = 20% of system cut (configurable)
  const bonusPct = await PlatformSettings.get('referrer_bonus_pct', 20);
  const bonus    = Math.round(systemCut * (bonusPct / 100));
  if (bonus <= 0) return null;

  // Credit referral balance (separate from main wallet)
  await User.findByIdAndUpdate(referrer._id, {
    $inc: { referralBalance: bonus, referralEarned: bonus },
  });

  // Log transaction
  await Transaction.create({
    user:          referrer._id,
    type:          'credit',
    amount:        bonus,
    description:   `Referral bonus — ${lister.name} received an inspection/entry fee`,
    category:      'referral_bonus',
    relatedEscrow: relatedEscrow || null,
    status:        'completed',
  });

  return { referrerId: referrer._id, bonus };
};

/**
 * Credit referrer bonus for a hotel booking commission.
 * @param {ObjectId} hotelOwnerId — the hotel owner who received the booking
 * @param {number}   commission   — the ₦ platform commission from this booking
 */
const creditHotelReferrerBonus = async ({ hotelOwnerId, commission, relatedHotelBooking }) => {
  const owner = await User.findById(hotelOwnerId).select('referredBy name');
  if (!owner?.referredBy) return null;

  const referrer = await User.findById(owner.referredBy).select('_id name');
  if (!referrer) return null;

  const bonusPct = await PlatformSettings.get('referrer_bonus_pct', 20);
  const bonus    = Math.round(commission * (bonusPct / 100));
  if (bonus <= 0) return null;

  await User.findByIdAndUpdate(referrer._id, {
    $inc: { referralBalance: bonus, referralEarned: bonus },
  });

  await Transaction.create({
    user:                referrer._id,
    type:                'credit',
    amount:              bonus,
    description:         `Referral bonus — hotel booking commission from ${owner.name}`,
    category:            'referral_bonus',
    relatedHotelBooking: relatedHotelBooking || null,
    status:              'completed',
  });

  return { referrerId: referrer._id, bonus };
};

module.exports = { creditReferrerBonus, creditHotelReferrerBonus };
