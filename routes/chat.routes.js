const router = require('express').Router();
const { getConversations, getMessages, startConversation, sendMessage, respondToProposal } = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth');

router.get('/conversations',                    protect, getConversations);
router.post('/start',                           protect, startConversation);
router.get('/:convId/messages',                 protect, getMessages);
router.post('/:convId/messages',                protect, sendMessage);
router.put('/:convId/messages/:msgId/proposal', protect, respondToProposal);

module.exports = router;
