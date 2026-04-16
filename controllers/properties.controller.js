const Property     = require('../models/Property');
const PropertyView = require('../models/PropertyView');
const User         = require('../models/User');
const { ok, fail } = require('../utils/response');
const { sendNotification }   = require('../services/notification.service');
const { emailTemplates }     = require('../services/email.service');
const { uploadToCloudinary } = require('../middleware/upload');

// GET /api/properties
const getProperties = async (req, res) => {
  try {
    const { type, state, lga, minPrice, maxPrice, bedrooms, availability, search, page = 1, limit = 20 } = req.query;

    const query = { status: 'approved' };

    if (type)         query.type         = type;
    if (state)        query.state        = state;
    if (lga)          query.lga          = lga;
    if (availability) query.availability = availability;
    if (bedrooms)     query.bedrooms     = Number(bedrooms);

    if (type === 'land' && (minPrice || maxPrice)) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (type === 'rental' && (minPrice || maxPrice)) {
      query.rent = {};
      if (minPrice) query.rent.$gte = Number(minPrice);
      if (maxPrice) query.rent.$lte = Number(maxPrice);
    }

    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { title: re }, { address: re }, { state: re },
        { lga: re },   { description: re }, { hotelName: re },
      ];
    }

    const options = {
      page:     Number(page),
      limit:    Number(limit),
      populate: { path: 'listedBy', select: 'name avatar phone kycVerified' },
      sort:     { createdAt: -1 },
    };

    const result = await Property.paginate(query, options);
    return ok(res, { data: result });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/properties/:id
const getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate('listedBy', 'name avatar phone kycVerified');
    if (!property) return fail(res, 'Property not found.', 404);
    return ok(res, { property });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties/:id/view — increment view count once per user/IP per 24 hours
const incrementView = async (req, res) => {
  try {
    const propertyId = req.params.id;

    // Identify viewer — logged-in user takes priority, else fall back to IP
    const userId = req.user?._id || null;
    const ip     = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.socket?.remoteAddress
                || 'unknown';

    // Check if this viewer already counted in the last 24 hours
    const filter = userId
      ? { property: propertyId, user: userId }
      : { property: propertyId, ip };

    const alreadyViewed = await PropertyView.findOne(filter);

    if (alreadyViewed) {
      // Already counted — just return current views without incrementing
      const property = await Property.findById(propertyId).select('views');
      if (!property) return fail(res, 'Property not found.', 404);
      return ok(res, { views: property.views });
    }

    // New view — increment and record it
    const [property] = await Promise.all([
      Property.findByIdAndUpdate(propertyId, { $inc: { views: 1 } }, { new: true }).select('views'),
      PropertyView.create({ property: propertyId, user: userId, ip }),
    ]);

    if (!property) return fail(res, 'Property not found.', 404);
    return ok(res, { views: property.views });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties
const createProperty = async (req, res) => {
  console.log('[createProperty] hit — type:', req.body?.type, '| files:', Object.keys(req.files || {}));
  try {
    const data = { ...req.body, listedBy: req.user._id, status: 'pending' };

    // Direct upload — field name: "images"
    if (req.files?.images) {
      const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      console.log('[createProperty] uploading', files.length, 'image(s) to Cloudinary...');
      const results = await Promise.all(
        files.map(f => uploadToCloudinary(f.data, 'pamprop/properties'))
      );
      data.images = results.map(r => r.secure_url);
      console.log('[createProperty] images uploaded OK');
    }

    // Video upload — field name: "video" (single file, max 1)
    if (req.files?.video) {
      const file = Array.isArray(req.files.video) ? req.files.video[0] : req.files.video;
      console.log('[createProperty] uploading video to Cloudinary...');
      const result = await uploadToCloudinary(file.data, 'pamprop/property-videos');
      data.video = result.secure_url;
      console.log('[createProperty] video uploaded OK');
    }

    console.log('[createProperty] saving property to DB...');
    const property = await Property.create(data);
    console.log('[createProperty] saved OK — id:', property._id);
    return ok(res, { property }, 'Property submitted for review.', 201);
  } catch (err) {
    console.error('[createProperty] error:', err.message);
    return fail(res, err.message);
  }
};

// PUT /api/properties/:id
const updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);
    if (property.listedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return fail(res, 'Not authorised.', 403);
    }

    if (req.uploadedUrls?.length) req.body.images = req.uploadedUrls;

    const updated = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return ok(res, { property: updated }, 'Property updated.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// DELETE /api/properties/:id
const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);
    if (property.listedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return fail(res, 'Not authorised.', 403);
    }
    await property.deleteOne();
    return ok(res, {}, 'Property deleted.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/properties/:id/availability
const updateAvailability = async (req, res) => {
  try {
    const { availability, availableFrom } = req.body;
    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);
    if (property.listedBy.toString() !== req.user._id.toString()) return fail(res, 'Not authorised.', 403);

    property.availability  = availability;
    property.availableFrom = availableFrom ? new Date(availableFrom) : null;
    await property.save();

    return ok(res, { property }, 'Availability updated.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/properties/my
const getMyProperties = async (req, res) => {
  try {
    const properties = await Property.find({ listedBy: req.user._id }).sort({ createdAt: -1 });
    return ok(res, { properties });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/properties/:id/review  (admin only)
const reviewListing = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return fail(res, 'Status must be "approved" or "rejected".', 400);
    }

    const property = await Property.findById(req.params.id).populate('listedBy', 'name email');
    if (!property) return fail(res, 'Property not found.', 404);

    property.status = status;
    if (status === 'rejected') property.rejectionReason = rejectionReason || 'No reason given.';
    else property.rejectionReason = '';
    await property.save();

    // Notify lister
    const lister = property.listedBy;
    if (lister) {
      const template = status === 'approved'
        ? emailTemplates.listingApproved(lister.name, property.title)
        : emailTemplates.listingRejected(lister.name, property.title, property.rejectionReason);

      await sendNotification({
        recipientId:    lister._id,
        recipientEmail: lister.email,
        type:           status === 'approved' ? 'listing_approved' : 'listing_rejected',
        title:          status === 'approved' ? '✅ Listing Approved' : '📝 Listing Needs Changes',
        message:        status === 'approved'
          ? `Your listing "${property.title}" is now live.`
          : `Your listing "${property.title}" needs changes: ${property.rejectionReason}`,
        subject:        template.subject,
        emailHtml:      template.html,
      });
    }

    return ok(res, { property }, `Listing ${status}.`);
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/properties/admin/pending  (admin only)
const getPendingListings = async (req, res) => {
  try {
    const properties = await Property.find({ status: 'pending' })
      .populate('listedBy', 'name email avatar kycVerified')
      .sort({ createdAt: -1 });
    return ok(res, { properties });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/properties/:id/comments
const getComments = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .select('comments listedBy')
      .populate('comments.user', 'name avatar kycVerified')
      .populate('comments.replies.user', 'name avatar kycVerified');
    if (!property) return fail(res, 'Property not found.', 404);
    return ok(res, { comments: property.comments, listedBy: property.listedBy });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties/:id/comments
const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return fail(res, 'Comment text is required.', 400);
    if (text.trim().length > 500) return fail(res, 'Comment must be 500 characters or less.', 400);

    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    property.comments.push({ user: req.user._id, text: text.trim() });
    await property.save();

    // Populate the newly added comment's user before returning
    const updated = await Property.findById(req.params.id)
      .select('comments listedBy')
      .populate('comments.user', 'name avatar kycVerified');

    const newComment = updated.comments[updated.comments.length - 1];

    // Notify listing owner if someone else commented
    if (property.listedBy.toString() !== req.user._id.toString()) {
      const owner = await User.findById(property.listedBy).select('name email');
      if (owner) {
        await sendNotification({
          recipientId:     owner._id,
          recipientEmail:  owner.email,
          title:           'New Comment on Your Listing',
          message:         `${req.user.name} commented on "${property.title}": "${text.trim().slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
          type:            'system',
          relatedProperty: property._id,
        });
      }
    }

    return ok(res, { comment: newComment, listedBy: updated.listedBy }, 'Comment added.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties/:id/comments/:commentId/replies
const addReply = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return fail(res, 'Reply text is required.', 400);
    if (text.trim().length > 500) return fail(res, 'Reply must be 500 characters or less.', 400);

    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    const comment = property.comments.id(req.params.commentId);
    if (!comment) return fail(res, 'Comment not found.', 404);

    comment.replies.push({ user: req.user._id, text: text.trim() });
    await property.save();

    // Populate the reply user
    const updated = await Property.findById(req.params.id)
      .select('comments listedBy')
      .populate('comments.user', 'name avatar kycVerified')
      .populate('comments.replies.user', 'name avatar kycVerified');

    const updatedComment = updated.comments.id(req.params.commentId);
    const newReply = updatedComment.replies[updatedComment.replies.length - 1];

    // Notify the comment author (if they're not the one replying)
    const commentAuthorId = comment.user.toString();
    if (commentAuthorId !== req.user._id.toString()) {
      const commentAuthor = await User.findById(commentAuthorId).select('name email');
      if (commentAuthor) {
        await sendNotification({
          recipientId:     commentAuthor._id,
          recipientEmail:  commentAuthor.email,
          title:           'New Reply to Your Comment',
          message:         `${req.user.name} replied to your comment: "${text.trim().slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
          type:            'system',
          relatedProperty: property._id,
        });
      }
    }

    // Also notify listing owner if they're different from commenter and replier
    const ownerId = property.listedBy.toString();
    if (ownerId !== req.user._id.toString() && ownerId !== commentAuthorId) {
      const owner = await User.findById(ownerId).select('name email');
      if (owner) {
        await sendNotification({
          recipientId:     owner._id,
          recipientEmail:  owner.email,
          title:           'New Reply on Your Listing',
          message:         `${req.user.name} replied to a comment on "${property.title}"`,
          type:            'system',
          relatedProperty: property._id,
        });
      }
    }

    return ok(res, { reply: newReply }, 'Reply added.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// DELETE /api/properties/:id/comments/:commentId/replies/:replyId
const deleteReply = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    const comment = property.comments.id(req.params.commentId);
    if (!comment) return fail(res, 'Comment not found.', 404);

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return fail(res, 'Reply not found.', 404);

    const isOwner  = reply.user.toString() === req.user._id.toString();
    const isAdmin  = ['admin', 'super_admin'].includes(req.user.role);
    const isLister = property.listedBy.toString() === req.user._id.toString();

    if (!isOwner && !isAdmin && !isLister) return fail(res, 'Not authorised.', 403);

    reply.deleteOne();
    await property.save();

    return ok(res, {}, 'Reply deleted.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/properties/:id/comments/:commentId
const editComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return fail(res, 'Comment text is required.', 400);
    if (text.trim().length > 500) return fail(res, 'Comment must be 500 characters or less.', 400);

    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    const comment = property.comments.id(req.params.commentId);
    if (!comment) return fail(res, 'Comment not found.', 404);

    if (comment.user.toString() !== req.user._id.toString())
      return fail(res, 'Not authorised.', 403);

    comment.text = text.trim();
    comment.editedAt = new Date();
    await property.save();

    const updated = await Property.findById(req.params.id)
      .select('comments')
      .populate('comments.user', 'name avatar kycVerified');

    return ok(res, { comment: updated.comments.id(req.params.commentId) }, 'Comment updated.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/properties/:id/comments/:commentId/replies/:replyId
const editReply = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return fail(res, 'Reply text is required.', 400);
    if (text.trim().length > 500) return fail(res, 'Reply must be 500 characters or less.', 400);

    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    const comment = property.comments.id(req.params.commentId);
    if (!comment) return fail(res, 'Comment not found.', 404);

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return fail(res, 'Reply not found.', 404);

    if (reply.user.toString() !== req.user._id.toString())
      return fail(res, 'Not authorised.', 403);

    reply.text = text.trim();
    reply.editedAt = new Date();
    await property.save();

    const updated = await Property.findById(req.params.id)
      .select('comments')
      .populate('comments.replies.user', 'name avatar kycVerified');

    const updatedComment = updated.comments.id(req.params.commentId);
    return ok(res, { reply: updatedComment.replies.id(req.params.replyId) }, 'Reply updated.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// DELETE /api/properties/:id/comments/:commentId
const deleteComment = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    const comment = property.comments.id(req.params.commentId);
    if (!comment) return fail(res, 'Comment not found.', 404);

    const isOwner  = comment.user.toString() === req.user._id.toString();
    const isAdmin  = ['admin', 'super_admin'].includes(req.user.role);
    const isLister = property.listedBy.toString() === req.user._id.toString();

    if (!isOwner && !isAdmin && !isLister) return fail(res, 'Not authorised.', 403);

    comment.deleteOne();
    await property.save();

    return ok(res, {}, 'Comment deleted.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties/:id/like  (toggle — requires auth)
const toggleLike = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return fail(res, 'Property not found.', 404);

    const userId  = req.user._id;
    const already = property.likedBy.some(id => id.toString() === userId.toString());

    if (already) {
      property.likedBy = property.likedBy.filter(id => id.toString() !== userId.toString());
      property.likes   = Math.max(0, (property.likes || 0) - 1);
    } else {
      property.likedBy.push(userId);
      property.likes = (property.likes || 0) + 1;
    }

    await property.save();
    return ok(res, { likes: property.likes, liked: !already });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/properties/land-insights?lga=X&state=Y&excludeId=Z
const getLandInsights = async (req, res) => {
  try {
    const { lga, state, excludeId } = req.query;
    if (!state) return fail(res, 'state is required.', 400);

    const buildQuery = (useLga) => {
      const q = { type: 'land', status: 'approved', price: { $gt: 0 } };
      if (useLga && lga) q.lga = lga;
      else q.state = state;
      if (excludeId) q._id = { $ne: excludeId };
      return q;
    };

    let listings = await Property.find(buildQuery(true)).select('price pricePerSqm size').lean();

    // Fall back to whole state if fewer than 3 comparables in the LGA
    const usedScope = listings.length >= 3 ? 'lga' : 'state';
    if (usedScope === 'state') {
      listings = await Property.find(buildQuery(false)).select('price pricePerSqm size').lean();
    }

    if (!listings.length) return ok(res, { insights: null });

    const prices = listings.map(l => Number(l.price)).filter(p => p > 0).sort((a, b) => a - b);
    const count  = prices.length;
    const sum    = prices.reduce((a, b) => a + b, 0);
    const avg    = Math.round(sum / count);
    const median = count % 2 === 0
      ? Math.round((prices[count / 2 - 1] + prices[count / 2]) / 2)
      : prices[Math.floor(count / 2)];
    const min = prices[0];
    const max = prices[count - 1];

    const psqmArr = listings.map(l => Number(l.pricePerSqm)).filter(v => v > 0);
    const pricePerSqmAvg = psqmArr.length
      ? Math.round(psqmArr.reduce((a, b) => a + b, 0) / psqmArr.length)
      : null;

    return ok(res, {
      insights: { avg, median, min, max, pricePerSqmAvg, count, scope: usedScope, lga, state },
    });
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getProperties, getPropertyById, incrementView, createProperty, updateProperty, deleteProperty, updateAvailability, getMyProperties, reviewListing, getPendingListings, getComments, addComment, editComment, deleteComment, addReply, editReply, deleteReply, toggleLike, getLandInsights };
