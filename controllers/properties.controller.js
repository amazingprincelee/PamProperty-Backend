const Property   = require('../models/Property');
const User       = require('../models/User');
const { ok, fail } = require('../utils/response');
const { sendNotification } = require('../services/notification.service');
const { emailTemplates }   = require('../services/email.service');

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
      query.$text = { $search: search };
    }

    const options = {
      page:     Number(page),
      limit:    Number(limit),
      populate: { path: 'listedBy', select: 'name avatar kycVerified' },
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

    property.views += 1;
    await property.save();

    return ok(res, { property });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/properties
const createProperty = async (req, res) => {
  try {
    const data = { ...req.body, listedBy: req.user._id, status: 'pending' };

    if (req.uploadedUrls?.length) data.images = req.uploadedUrls;

    const property = await Property.create(data);
    return ok(res, { property }, 'Property submitted for review.', 201);
  } catch (err) {
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

module.exports = { getProperties, getPropertyById, createProperty, updateProperty, deleteProperty, updateAvailability, getMyProperties, reviewListing, getPendingListings };
