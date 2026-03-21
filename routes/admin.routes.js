const router = require('express').Router();
const { getPendingProperties, approveProperty, rejectProperty, getAllUsers, approveKyc, getDisputes, resolveDispute } = require('../controllers/admin.controller');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly); // All admin routes require auth + admin role

router.get('/properties',            getPendingProperties);
router.put('/properties/:id/approve',approveProperty);
router.put('/properties/:id/reject', rejectProperty);
router.get('/users',                 getAllUsers);
router.put('/users/:id/kyc',         approveKyc);
router.get('/disputes',              getDisputes);
router.put('/disputes/:id/resolve',  resolveDispute);

module.exports = router;
