const router = require('express').Router();
const { getProperties, getPropertyById, createProperty, updateProperty, deleteProperty, updateAvailability, getMyProperties, reviewListing, getPendingListings, getComments, addComment, deleteComment, addReply, deleteReply } = require('../controllers/properties.controller');
const { protect, adminOnly } = require('../middleware/auth');
const { handleUpload }       = require('../middleware/upload');

router.get('/',                    getProperties);
router.get('/my',                  protect, getMyProperties);
router.get('/admin/pending',       protect, adminOnly, getPendingListings);
router.get('/:id',                 getPropertyById);
router.post('/',                   protect, handleUpload('pamprop/properties'), createProperty);
router.put('/:id',                 protect, handleUpload('pamprop/properties'), updateProperty);
router.delete('/:id',              protect, deleteProperty);
router.put('/:id/availability',    protect, updateAvailability);
router.put('/:id/review',          protect, adminOnly, reviewListing);

// Comments
router.get('/:id/comments',                                     getComments);
router.post('/:id/comments',                                    protect, addComment);
router.delete('/:id/comments/:commentId',                       protect, deleteComment);
// Replies
router.post('/:id/comments/:commentId/replies',                 protect, addReply);
router.delete('/:id/comments/:commentId/replies/:replyId',      protect, deleteReply);

module.exports = router;
