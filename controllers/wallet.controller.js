const Transaction  = require('../models/Transaction');
const User         = require('../models/User');
const BankAccount  = require('../models/BankAccount');
const { getBalance, initiateTopup, verifyWebhookSignature, creditWallet, initiateWithdrawal, createVirtualAccount, getNigerianBanks, resolveAccountName } = require('../services/payment.service');
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

// POST /api/wallet/withdraw — withdraw to a saved bank account
const withdraw = async (req, res) => {
  try {
    const { amount, bankAccountId } = req.body;
    if (!bankAccountId) return fail(res, 'Please select a saved bank account.', 400);

    const bankAccount = await BankAccount.findOne({ _id: bankAccountId, user: req.user._id });
    if (!bankAccount) return fail(res, 'Bank account not found.', 404);

    const data = await initiateWithdrawal({
      user:          req.user,
      amountInNaira: amount,
      bankCode:      bankAccount.bankCode,
      accountNumber: bankAccount.accountNumber,
      accountName:   bankAccount.accountName,
    });
    return ok(res, { data }, 'Withdrawal initiated.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// GET /api/wallet/banks — list Nigerian banks for dropdown
const getBanks = async (req, res) => {
  try {
    const banks = await getNigerianBanks();
    return ok(res, { banks });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/wallet/resolve-account?account_number=&bank_code= — verify account name
const resolveAccount = async (req, res) => {
  try {
    const { account_number, bank_code } = req.query;
    if (!account_number || !bank_code) return fail(res, 'account_number and bank_code are required.', 400);
    if (account_number.length !== 10) return fail(res, 'Account number must be 10 digits.', 400);
    const accountName = await resolveAccountName(account_number, bank_code);
    return ok(res, { accountName });
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// GET /api/wallet/bank-accounts — list saved bank accounts
const getBankAccounts = async (req, res) => {
  try {
    const accounts = await BankAccount.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: 1 });
    return ok(res, { accounts });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/wallet/bank-accounts — add a new saved bank account
const addBankAccount = async (req, res) => {
  try {
    const { bankName, bankCode, accountNumber } = req.body;
    if (!bankName || !bankCode || !accountNumber) return fail(res, 'bankName, bankCode and accountNumber are required.', 400);

    // Check duplicate
    const existing = await BankAccount.findOne({ user: req.user._id, accountNumber, bankCode });
    if (existing) return fail(res, 'This account is already saved.', 400);

    // Verify account name with Paystack
    const accountName = await resolveAccountName(accountNumber, bankCode);

    // First account is default
    const count = await BankAccount.countDocuments({ user: req.user._id });
    const account = await BankAccount.create({
      user: req.user._id,
      bankName, bankCode, accountNumber, accountName,
      isDefault: count === 0,
    });

    return ok(res, { account }, 'Bank account saved.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// DELETE /api/wallet/bank-accounts/:id — remove a saved bank account
const deleteBankAccount = async (req, res) => {
  try {
    await BankAccount.deleteOne({ _id: req.params.id, user: req.user._id });
    return ok(res, {}, 'Bank account removed.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PATCH /api/wallet/bank-accounts/:id/default — set as default
const setDefaultBankAccount = async (req, res) => {
  try {
    await BankAccount.updateMany({ user: req.user._id }, { isDefault: false });
    await BankAccount.updateOne({ _id: req.params.id, user: req.user._id }, { isDefault: true });
    return ok(res, {}, 'Default account updated.');
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = {
  getWalletBalance, getTransactions, topup, paystackWebhook,
  withdraw, getOrCreateVirtualAccount,
  getBanks, resolveAccount,
  getBankAccounts, addBankAccount, deleteBankAccount, setDefaultBankAccount,
};
