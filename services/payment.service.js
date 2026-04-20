const Paystack    = require('paystack');
const Transaction = require('../models/Transaction');
const User        = require('../models/User');
const crypto      = require('crypto');
const https       = require('https');

const paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);

/* ─────────────────────────────────────────────
   PAYSTACK HELPER — JSON request
───────────────────────────────────────────── */
const paystackRequest = (method, path, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = https.request({
    hostname: 'api.paystack.co',
    path,
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(data && { 'Content-Length': Buffer.byteLength(data) }),
    },
  }, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON from Paystack')); }
    });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

/* ─────────────────────────────────────────────
   COMPUTE WALLET BALANCE
   Balance = sum of all completed credits - sum of all completed debits
───────────────────────────────────────────── */
const getBalance = async (userId) => {
  const transactions = await Transaction.find({ user: userId, status: 'completed' });
  return transactions.reduce((total, tx) => {
    return tx.type === 'credit' ? total + tx.amount : total - tx.amount;
  }, 0);
};

/* ─────────────────────────────────────────────
   INITIALISE PAYSTACK CHARGE (Top-up)
───────────────────────────────────────────── */
const initiateTopup = async (user, amountInKobo) => {
  const response = await paystack.transaction.initialize({
    email:     user.email,
    amount:    amountInKobo, // Paystack uses kobo (₦1 = 100 kobo)
    reference: `TOPUP-${user._id}-${Date.now()}`,
    metadata:  { userId: user._id.toString(), type: 'topup' },
  });
  return response.data; // { authorization_url, access_code, reference }
};

/* ─────────────────────────────────────────────
   VERIFY PAYSTACK WEBHOOK SIGNATURE
───────────────────────────────────────────── */
const verifyWebhookSignature = (body, signature) => {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(body))
    .digest('hex');
  return hash === signature;
};

/* ─────────────────────────────────────────────
   CREDIT WALLET (called after webhook verification)
───────────────────────────────────────────── */
const creditWallet = async ({ userId, amountInKobo, paystackRef, description }) => {
  const amountInNaira = amountInKobo / 100;

  // Check for duplicate webhook (idempotency)
  const existing = await Transaction.findOne({ paystackRef });
  if (existing) return existing;

  const tx = await Transaction.create({
    user:        userId,
    type:        'credit',
    amount:      amountInNaira,
    description: description || 'Wallet top-up',
    category:    'topup',
    paystackRef,
    status:      'completed',
  });

  return tx;
};

/* ─────────────────────────────────────────────
   DEBIT WALLET (internal — escrow, hotel, etc.)
───────────────────────────────────────────── */
const debitWallet = async ({ userId, amount, description, category, relatedEscrow, relatedHotelBooking, relatedProperty }) => {
  const balance = await getBalance(userId);
  if (balance < amount) throw new Error('Insufficient wallet balance.');

  const tx = await Transaction.create({
    user: userId,
    type: 'debit',
    amount,
    description,
    category,
    relatedEscrow:       relatedEscrow       || null,
    relatedHotelBooking: relatedHotelBooking || null,
    relatedProperty:     relatedProperty     || null,
    status: 'completed',
  });

  return tx;
};

/* ─────────────────────────────────────────────
   INTERNAL CREDIT (escrow release, refund, etc.)
───────────────────────────────────────────── */
const internalCredit = async ({ userId, amount, description, category, relatedEscrow, relatedHotelBooking }) => {
  const tx = await Transaction.create({
    user: userId,
    type: 'credit',
    amount,
    description,
    category,
    relatedEscrow:       relatedEscrow       || null,
    relatedHotelBooking: relatedHotelBooking || null,
    status: 'completed',
  });
  return tx;
};

/* ─────────────────────────────────────────────
   WITHDRAW (Paystack Transfer API)
───────────────────────────────────────────── */
const initiateWithdrawal = async ({ user, amountInNaira, bankCode, accountNumber, accountName }) => {
  const balance = await getBalance(user._id);
  if (balance < amountInNaira) throw new Error('Insufficient wallet balance.');

  // Create transfer recipient
  const recipientRes = await paystack.transferrecipient.create({
    type:           'nuban',
    name:           accountName,
    account_number: accountNumber,
    bank_code:      bankCode,
    currency:       'NGN',
  });
  const recipientCode = recipientRes.data.recipient_code;

  // Initiate transfer
  const transferRes = await paystack.transfer.create({
    source:    'balance',
    amount:    amountInNaira * 100, // kobo
    recipient: recipientCode,
    reason:    `Pamprop withdrawal for ${user.name}`,
    reference: `WITHDRAW-${user._id}-${Date.now()}`,
  });

  // Debit wallet
  await debitWallet({
    userId:      user._id,
    amount:      amountInNaira,
    description: `Withdrawal to ${accountName} (${accountNumber})`,
    category:    'withdrawal',
  });

  return transferRes.data;
};

/* ─────────────────────────────────────────────
   CREATE PAYSTACK DEDICATED VIRTUAL ACCOUNT
   1. Create/fetch Paystack customer
   2. Assign dedicated NUBAN account
───────────────────────────────────────────── */
const createVirtualAccount = async (user) => {
  const nameParts  = user.name.trim().split(' ');
  const firstName  = nameParts[0];
  const lastName   = nameParts.slice(1).join(' ') || firstName;

  // Create customer
  const custRes = await paystackRequest('POST', '/customer', {
    email:      user.email,
    first_name: firstName,
    last_name:  lastName,
    phone:      user.phone || undefined,
  });
  if (!custRes.status) throw new Error(custRes.message || 'Failed to create Paystack customer');
  const customerCode = custRes.data.customer_code;

  // Assign dedicated virtual account (wema-bank is widely available)
  const vaRes = await paystackRequest('POST', '/dedicated_account', {
    customer:       customerCode,
    preferred_bank: 'wema-bank',
  });
  if (!vaRes.status) throw new Error(vaRes.message || 'Failed to create virtual account');

  return {
    accountNumber: vaRes.data.account_number,
    bankName:      vaRes.data.bank?.name || 'Wema Bank',
    accountName:   vaRes.data.account_name || user.name,
    customerCode,
  };
};

module.exports = {
  getBalance,
  initiateTopup,
  verifyWebhookSignature,
  creditWallet,
  debitWallet,
  internalCredit,
  initiateWithdrawal,
  createVirtualAccount,
};
