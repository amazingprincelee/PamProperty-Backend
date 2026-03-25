const User     = require('../models/User');
const Property = require('../models/Property');
const { uploadToCloudinary } = require('../middleware/upload');
const { sendNotification }   = require('../services/notification.service');
const { emailTemplates }     = require('../services/email.service');
const { ok, fail } = require('../utils/response');

// GET /api/users/:id
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return fail(res, 'User not found.', 404);
    return ok(res, { user });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
  console.log("omen prince lee, i reach o");
  
  try {
    if (req.params.id !== req.user._id.toString()) return fail(res, 'Not authorised.', 403);

    const { name, phone, emailNotifs, avatar, userType, state, lga, address, bio, agencyName, cacNumber, yearsOfExperience, onboardingDone } = req.body || {};
    const updates = {};
    if (name)                        updates.name              = name;
    if (phone)                       updates.phone             = phone;
    if (avatar)                      updates.avatar            = avatar;
    if (emailNotifs !== undefined)   updates.emailNotifs       = emailNotifs;
    if (userType)                    updates.userType          = userType;
    if (state  !== undefined)        updates.state             = state;
    if (lga    !== undefined)        updates.lga               = lga;
    if (address !== undefined)       updates.address           = address;
    if (bio    !== undefined)        updates.bio               = bio;
    if (agencyName !== undefined)    updates.agencyName        = agencyName;
    if (cacNumber !== undefined)     updates.cacNumber         = cacNumber;
    if (yearsOfExperience !== undefined) updates.yearsOfExperience = yearsOfExperience;
    if (onboardingDone !== undefined)    updates.onboardingDone    = onboardingDone;

    // Handle direct file upload (field name: avatar)
    if (req.files?.avatar) {
      const result = await uploadToCloudinary(req.files.avatar.data, 'pamprop/avatars');
      updates.avatar = result.secure_url;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    return ok(res, { user }, 'Profile updated.');
  } catch (err) {
    console.error('[updateUser ERROR]', err.message);
    return fail(res, err.message);
  }
};

// POST /api/users/:id/follow
const toggleFollow = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return fail(res, 'User not found.', 404);
    if (target._id.toString() === req.user._id.toString()) return fail(res, 'Cannot follow yourself.', 400);

    const isFollowing = req.user.following.includes(target._id);

    if (isFollowing) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: target._id } });
      await User.findByIdAndUpdate(target._id,   { $pull: { followers: req.user._id } });
      return ok(res, {}, 'Unfollowed.');
    } else {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: target._id } });
      await User.findByIdAndUpdate(target._id,   { $addToSet: { followers: req.user._id } });
      const et = emailTemplates.newFollower(req.user.name);
      await sendNotification({
        recipientId:    target._id,
        recipientEmail: target.email,
        title:          'New Follower',
        message:        `${req.user.name} started following you.`,
        type:           'system',
        emailSubject:   et.subject,
        emailHtml:      et.html,
      });
      return ok(res, {}, 'Following.');
    }
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/users/:id/listings
const getUserListings = async (req, res) => {
  try {
    const properties = await Property.find({ listedBy: req.params.id, status: 'approved' }).sort({ createdAt: -1 });
    return ok(res, { properties });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/users/saved/:propertyId
const toggleSaved = async (req, res) => {
  try {
    const user       = await User.findById(req.user._id);
    const propertyId = req.params.propertyId;
    const isSaved    = user.savedProperties.includes(propertyId);

    if (isSaved) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { savedProperties: propertyId } });
      return ok(res, {}, 'Removed from saved.');
    } else {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { savedProperties: propertyId } });
      return ok(res, {}, 'Saved.');
    }
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/users/kyc — upload KYC docs
const submitKyc = async (req, res) => {
  try {
    // Direct upload — field name: "docs"
    if (req.files?.docs) {
      const files = Array.isArray(req.files.docs) ? req.files.docs : [req.files.docs];
      const results = await Promise.all(
        files.map(f => uploadToCloudinary(f.data, 'pamprop/kyc'))
      );
      req.uploadedUrls = results.map(r => r.secure_url);
    }

    if (!req.uploadedUrls?.length) return fail(res, 'No documents uploaded.', 400);
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        kycDocuments:   req.uploadedUrls,
        kycStatus:      'pending',
        kycSubmittedAt: new Date(),
      },
      { new: true }
    ).select('-password');
    return ok(res, { user }, 'KYC documents submitted for review.');
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getUser, updateUser, toggleFollow, getUserListings, toggleSaved, submitKyc };
