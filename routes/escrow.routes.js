const router = require('express').Router();
const { createSession, getSession, getMySessions, confirm, requestPayment, release, refund, dispute, logVisit } = require('../controllers/escrow.controller');
const { protect } = require('../middleware/auth');

router.post('/',                    protect, createSession);
router.get('/my',                   protect, getMySessions);
router.get('/:id',                  protect, getSession);
router.put('/:id/confirm',          protect, confirm);
router.put('/:id/request-payment',  protect, requestPayment);
router.put('/:id/release',          protect, release);
router.put('/:id/refund',           protect, refund);
router.put('/:id/log-visit',        protect, logVisit);
router.post('/:id/dispute',         protect, dispute);

module.exports = router;
