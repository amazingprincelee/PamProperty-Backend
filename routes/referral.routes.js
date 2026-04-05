const router = require('express').Router();
const { getStats, getHistory, withdraw } = require('../controllers/referral.controller');
const { protect } = require('../middleware/auth');

router.get('/stats',   protect, getStats);
router.get('/history', protect, getHistory);
router.post('/withdraw', protect, withdraw);

module.exports = router;
