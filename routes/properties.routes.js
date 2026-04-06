const router = require('express').Router();
const { getProperties, getPropertyById, incrementView, createProperty, updateProperty, deleteProperty, updateAvailability, getMyProperties, reviewListing, getPendingListings, getComments, addComment, editComment, deleteComment, addReply, editReply, deleteReply, toggleLike, getLandInsights } = require('../controllers/properties.controller');
const { getReviews, submitReview, checkEligibility } = require('../controllers/review.controller');
const { protect, adminOnly } = require('../middleware/auth');
const { handleUpload }       = require('../middleware/upload');

router.get('/',                    getProperties);
router.get('/land-insights',       getLandInsights);
router.get('/my',                  protect, getMyProperties);
router.get('/admin/pending',       protect, adminOnly, getPendingListings);
router.get('/:id',                 getPropertyById);
router.post('/:id/view',           incrementView);
router.post('/:id/like',           protect, toggleLike);
router.post('/',                   protect, handleUpload('pamprop/properties'), createProperty);
router.put('/:id',                 protect, handleUpload('pamprop/properties'), updateProperty);
router.delete('/:id',              protect, deleteProperty);
router.put('/:id/availability',    protect, updateAvailability);
router.put('/:id/review',          protect, adminOnly, reviewListing);

// Reviews
router.get('/:id/reviews',             getReviews);
router.post('/:id/reviews',            protect, submitReview);
router.get('/:id/reviews/eligibility', protect, checkEligibility);

// Comments
router.get('/:id/comments',                                     getComments);
router.post('/:id/comments',                                    protect, addComment);
router.put('/:id/comments/:commentId',                          protect, editComment);
router.delete('/:id/comments/:commentId',                       protect, deleteComment);
// Replies
router.post('/:id/comments/:commentId/replies',                 protect, addReply);
router.put('/:id/comments/:commentId/replies/:replyId',         protect, editReply);
router.delete('/:id/comments/:commentId/replies/:replyId',      protect, deleteReply);

module.exports = router;
