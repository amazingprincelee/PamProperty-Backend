const cloudinary = require('../config/cloudinary');

// Upload a single file buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'pamprop') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

// Middleware: upload all incoming files to Cloudinary and attach URLs to req
const handleUpload = (folder = 'pamprop') => async (req, res, next) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) return next();

    const urls = [];
    const files = req.files.media
      ? Array.isArray(req.files.media) ? req.files.media : [req.files.media]
      : [];

    for (const file of files) {
      const result = await uploadToCloudinary(file.data, folder);
      urls.push(result.secure_url);
    }

    req.uploadedUrls = urls;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Upload failed.', error: err.message });
  }
};

module.exports = { handleUpload, uploadToCloudinary };
