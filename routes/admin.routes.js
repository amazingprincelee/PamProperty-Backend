const router = require('express').Router();
const {
  getPendingProperties, approveProperty, rejectProperty,
  getAllUsers, changeUserRole,
  getKycQueue, reviewKyc,
  getDisputes, resolveDispute, requestDisputeInfo,
  getAnalytics,
  broadcastUpdate, getReleases,
} = require('../controllers/admin.controller');
const { getAllTickets, updateTicketStatus, replyToTicket } = require('../controllers/support.controller');
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');

// All admin routes require auth + at least admin role
router.use(protect, adminOnly);

// Listings
router.get('/properties',                getPendingProperties);
router.put('/properties/:id/approve',    approveProperty);
router.put('/properties/:id/reject',     rejectProperty);

// Users (listing users is admin, changing roles is super_admin only)
router.get('/users',                     getAllUsers);
router.put('/users/:id/role',            superAdminOnly, changeUserRole);

// KYC queue
router.get('/kyc',                       getKycQueue);
router.put('/kyc/:userId/review',        reviewKyc);

// Disputes
router.get('/disputes',                  getDisputes);
router.put('/disputes/:id/resolve',      resolveDispute);
router.put('/disputes/:id/request-info', requestDisputeInfo);

// Analytics
router.get('/analytics',                 getAnalytics);

// Support tickets
router.get('/support',                   getAllTickets);
router.put('/support/:id/status',        updateTicketStatus);
router.post('/support/:id/reply',        replyToTicket);

// App releases / broadcast
router.post('/broadcast-update',         broadcastUpdate);
router.get('/releases',                  getReleases);

module.exports = router;
