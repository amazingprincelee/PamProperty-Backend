const router = require('express').Router();
const {
  getWalletBalance, getTransactions, topup, paystackWebhook,
  withdraw, getOrCreateVirtualAccount,
  getBanks, resolveAccount,
  getBankAccounts, addBankAccount, deleteBankAccount, setDefaultBankAccount,
} = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth');

router.get('/balance',                          protect, getWalletBalance);
router.get('/transactions',                     protect, getTransactions);
router.post('/topup',                           protect, topup);
router.post('/webhook',                         paystackWebhook);
router.post('/withdraw',                        protect, withdraw);
router.post('/virtual-account',                 protect, getOrCreateVirtualAccount);
router.get('/banks',                            protect, getBanks);
router.get('/resolve-account',                  protect, resolveAccount);
router.get('/bank-accounts',                    protect, getBankAccounts);
router.post('/bank-accounts',                   protect, addBankAccount);
router.delete('/bank-accounts/:id',             protect, deleteBankAccount);
router.patch('/bank-accounts/:id/default',      protect, setDefaultBankAccount);

module.exports = router;
