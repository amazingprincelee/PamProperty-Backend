const router = require('express').Router();
const { getSettings, updateSettings, getPublicFees } = require('../controllers/settings.controller');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/fees',  getPublicFees);          // public — exposes fee amounts only
router.get('/',      protect, adminOnly, getSettings);
router.put('/',      protect, adminOnly, updateSettings);

module.exports = router;
