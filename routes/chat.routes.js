const router = require('express').Router();
const { getConversations, getMessages, startConversation, startDirectConversation, sendMessage, respondToProposal, uploadChatFile } = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');

router.get('/conversations',                    protect, getConversations);
router.post('/start',                           protect, startConversation);
router.post('/start-direct',                    protect, startDirectConversation);
router.post('/upload',                          protect, handleUpload('pamprop/chat'), uploadChatFile);
router.get('/:convId/messages',                 protect, getMessages);
router.post('/:convId/messages',                protect, sendMessage);
router.put('/:convId/messages/:msgId/proposal', protect, respondToProposal);

module.exports = router;
