const User        = require('../models/User');
const Transaction = require('../models/Transaction');
const { ok, fail } = require('../utils/response');

// GET /api/referrals/stats
const getStats = async (req, res) => {
  try {
    const user    = await User.findById(req.user._id).select('referralBalance referralEarned referralCode');
    const referred = await User.find({ referredBy: req.user._id }).select('role createdAt');

    const activeAgents = referred.filter(u => ['agent', 'owner', 'hotel_manager'].includes(u.role)).length;

    return ok(res, {
      stats: {
        walletBalance:   user.referralBalance,
        totalEarned:     user.referralEarned,
        totalReferrals:  referred.length,
        activeAgents,
        referralCode:    user.referralCode,
      },
    });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/referrals/history
const getHistory = async (req, res) => {
  try {
    const history = await Transaction.find({
      user:     req.user._id,
      category: 'referral_bonus',
    }).sort({ createdAt: -1 }).limit(50);

    return ok(res, {
      history: history.map(t => ({
        _id:         t._id,
        amount:      t.amount,
        description: t.description,
        date:        t.createdAt,
      })),
    });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/referrals/withdraw
const withdraw = async (req, res) => {
  try {
    const { amount, bankName, accountNumber } = req.body;
    if (!amount || amount < 1000) return fail(res, 'Minimum withdrawal is ₦1,000.', 400);
    if (!bankName || !accountNumber) return fail(res, 'Bank name and account number are required.', 400);

    const user = await User.findById(req.user._id).select('referralBalance name');
    if (user.referralBalance < amount) return fail(res, 'Insufficient referral balance.', 400);

    // Deduct from referral balance
    await User.findByIdAndUpdate(req.user._id, { $inc: { referralBalance: -amount } });

    // Log as debit transaction
    await Transaction.create({
      user:        req.user._id,
      type:        'debit',
      amount,
      description: `Referral withdrawal to ${bankName} (${accountNumber})`,
      category:    'withdrawal',
      status:      'completed',
    });

    // TODO: Trigger actual bank transfer via Paystack when live keys are set

    return ok(res, {}, `Withdrawal of ₦${amount.toLocaleString()} submitted. You will be paid within 24 hours.`);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

module.exports = { getStats, getHistory, withdraw };
