const router = require('express').Router();
const { protect }      = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');
const { ok, fail }     = require('../utils/response');

// POST /api/upload/media
router.post('/media', protect, handleUpload('pamprop/general'), (req, res) => {
  if (!req.uploadedUrls?.length) return fail(res, 'No files uploaded.', 400);
  return ok(res, { urls: req.uploadedUrls }, 'Upload successful.');
});

module.exports = router;
