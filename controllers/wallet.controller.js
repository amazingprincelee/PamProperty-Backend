const Transaction = require('../models/Transaction');
const User        = require('../models/User');
const { getBalance, initiateTopup, verifyWebhookSignature, creditWallet, initiateWithdrawal, createVirtualAccount } = require('../services/payment.service');
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
      const { reference, amount, metadata, customer } = event.data;

      if (metadata?.userId && metadata?.type === 'topup') {
        // Regular card/bank topup
        await creditWallet({
          userId:       metadata.userId,
          amountInKobo: amount,
          paystackRef:  reference,
          description:  'Wallet top-up via Paystack',
        });
      } else if (customer?.customer_code) {
        // Bank transfer via dedicated virtual account
        const user = await User.findOne({ paystackCustomerCode: customer.customer_code });
        if (user) {
          await creditWallet({
            userId:       user._id,
            amountInKobo: amount,
            paystackRef:  reference,
            description:  'Bank transfer to virtual account',
          });
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    return res.sendStatus(200); // Always return 200 to Paystack
  }
};

// POST /api/wallet/virtual-account — get or create dedicated virtual account
const getOrCreateVirtualAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.virtualAccountNumber) {
      return ok(res, {
        accountNumber: user.virtualAccountNumber,
        bankName:      user.virtualAccountBank,
        accountName:   user.virtualAccountName,
      });
    }

    const va = await createVirtualAccount(user);
    user.paystackCustomerCode = va.customerCode;
    user.virtualAccountNumber = va.accountNumber;
    user.virtualAccountBank   = va.bankName;
    user.virtualAccountName   = va.accountName;
    await user.save();

    return ok(res, {
      accountNumber: va.accountNumber,
      bankName:      va.bankName,
      accountName:   va.accountName,
    }, 'Virtual account created.');
  } catch (err) {
    return fail(res, err.message);
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

module.exports = { getWalletBalance, getTransactions, topup, paystackWebhook, withdraw, getOrCreateVirtualAccount };
