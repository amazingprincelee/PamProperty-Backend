const router = require('express').Router();
const {
  createTicket, getMyTickets, getTicket, replyToTicket,
} = require('../controllers/support.controller');
const { protect } = require('../middleware/auth');

router.post('/',          protect, createTicket);
router.get('/my',         protect, getMyTickets);
router.get('/:id',        protect, getTicket);
router.post('/:id/reply', protect, replyToTicket);

module.exports = router;
