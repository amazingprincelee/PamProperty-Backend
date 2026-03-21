const Transaction = require('../models/Transaction');
const { getBalance, initiateTopup, verifyWebhookSignature, creditWallet, initiateWithdrawal } = require('../services/payment.service');
const { ok, fail } = require('../utils/response');

// GET /api/wallet/balance
const getWalletBalance = async (req, res) => {
  try {
    const balance = await getBalance(req.user._id);
    return ok(res, { balance });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/wallet/transactions
const getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id, status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(50);
    return ok(res, { transactions });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/wallet/topup — initialise Paystack charge
const topup = async (req, res) => {
  try {
    const { amount } = req.body; // amount in naira
    if (!amount || amount < 100) return fail(res, 'Minimum top-up is ₦100.', 400);

    const data = await initiateTopup(req.user, amount * 100); // convert to kobo
    return ok(res, { data }, 'Paystack payment initialised.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/wallet/webhook — Paystack webhook handler
const paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const isValid   = verifyWebhookSignature(req.body, signature);
    if (!isValid) return fail(res, 'Invalid signature.', 400);

    const event = req.body;

    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;
      const { userId, type } = metadata;

      if (type === 'topup') {
        await creditWallet({
          userId,
          amountInKobo: amount,
          paystackRef:  reference,
          description:  'Wallet top-up via Paystack',
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    return res.sendStatus(200); // Always return 200 to Paystack
  }
};

// POST /api/wallet/withdraw
const withdraw = async (req, res) => {
  try {
    const { amount, bankCode, accountNumber, accountName } = req.body;
    const data = await initiateWithdrawal({ user: req.user, amountInNaira: amount, bankCode, accountNumber, accountName });
    return ok(res, { data }, 'Withdrawal initiated.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

module.exports = { getWalletBalance, getTransactions, topup, paystackWebhook, withdraw };
