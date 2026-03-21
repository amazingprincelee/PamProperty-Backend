const router = require('express').Router();
const { getWalletBalance, getTransactions, topup, paystackWebhook, withdraw } = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth');

router.get('/balance',      protect, getWalletBalance);
router.get('/transactions', protect, getTransactions);
router.post('/topup',       protect, topup);
router.post('/webhook',     paystackWebhook); // No auth — Paystack calls this
router.post('/withdraw',    protect, withdraw);

module.exports = router;
