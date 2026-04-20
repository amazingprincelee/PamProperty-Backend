const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const Property     = require('../models/Property');
const { getIO }    = require('../config/socket');
const { sendNotification }   = require('../services/notification.service');
const { emailTemplates }     = require('../services/email.service');
const { ok, fail } = require('../utils/response');

// GET /api/chat/conversations
const getConversations = async (req, res) => {
  try {
    const convs = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'name avatar phone')
      .populate({ path: 'property', select: 'title images type listedBy', populate: { path: 'listedBy', select: '_id name' } })
      .sort({ lastTime: -1 })
      .lean();

    // For conversations missing visitStage (old records or missed updates),
    // derive the stage from their messages so Requests page always shows them correctly.
    const nullIds = convs.filter(c => !c.visitStage).map(c => c._id);
    if (nullIds.length) {
      const msgs = await Message.find(
        { conversation: { $in: nullIds }, type: { $in: ['visit_request', 'date_proposal'] } },
        'conversation type proposalStatus'
      ).lean();
      const stageMap = {};
      msgs.forEach(m => {
        const cid = m.conversation.toString();
        if (m.type === 'visit_request' && !stageMap[cid]) stageMap[cid] = 'requested';
        if (m.type === 'date_proposal') {
          if (m.proposalStatus === 'accepted') stageMap[cid] = 'agreed';
          else if (m.proposalStatus === 'pending' && stageMap[cid] !== 'agreed') stageMap[cid] = 'proposed';
        }
      });
      convs.forEach(c => {
        if (!c.visitStage && stageMap[c._id.toString()]) c.visitStage = stageMap[c._id.toString()];
      });
    }

    return ok(res, { conversations: convs });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/chat/:convId/messages
const getMessages = async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.convId);
    if (!conv) return fail(res, 'Conversation not found.', 404);
    if (!conv.participants.includes(req.user._id)) return fail(res, 'Not authorised.', 403);

    const messages = await Message.find({ conversation: req.params.convId })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      { conversation: req.params.convId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    conv.unreadCount.set(req.user._id.toString(), 0);
    await conv.save();

    return ok(res, { messages });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/chat/start — start or find existing conversation
const startConversation = async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findById(propertyId).populate('listedBy', 'name');
    if (!property) return fail(res, 'Property not found.', 404);

    let conv = await Conversation.findOne({
      property:     propertyId,
      participants: { $all: [req.user._id, property.listedBy._id] },
    });

    if (!conv) {
      conv = await Conversation.create({
        property:     propertyId,
        participants: [req.user._id, property.listedBy._id],
      });
    }

    await conv.populate('participants', 'name avatar');
    await conv.populate('property', 'title images type');

    return ok(res, { conversation: conv }, 'Conversation ready.', 201);
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/chat/:convId/messages
const sendMessage = async (req, res) => {
  try {
    const { text, type = 'text', proposedDate, proposedTime, proposedNote, attachmentUrl, attachmentName, attachmentSize } = req.body;
    const conv = await Conversation.findById(req.params.convId).populate('participants', 'name email');
    if (!conv) return fail(res, 'Conversation not found.', 404);
    if (!conv.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return fail(res, 'Not authorised.', 403);
    }

    const message = await Message.create({
      conversation:   req.params.convId,
      sender:         req.user._id,
      type,
      text:           text || '',
      attachmentUrl:  attachmentUrl  || null,
      attachmentName: attachmentName || null,
      attachmentSize: attachmentSize || null,
      proposedDate:   proposedDate || null,
      proposedTime:   proposedTime || null,
      proposedNote:   proposedNote || null,
      readBy:         [req.user._id],
    });

    // Update conversation last message + visitStage
    conv.lastMessage = text || '📅 Inspection date proposed';
    conv.lastTime    = new Date();
    if (type === 'visit_request')  conv.visitStage = 'requested';
    if (type === 'date_proposal')  conv.visitStage = 'proposed';
    conv.participants.forEach(p => {
      if (p._id.toString() !== req.user._id.toString()) {
        const current = conv.unreadCount.get(p._id.toString()) || 0;
        conv.unreadCount.set(p._id.toString(), current + 1);
      }
    });
    await conv.save();

    const populated = await message.populate('sender', 'name avatar');

    // Emit real-time: conversation room + recipient's personal room
    const recipient = conv.participants.find(p => p._id.toString() !== req.user._id.toString());
    try {
      const io = getIO();
      io.to(req.params.convId).emit('new_message', populated);
      if (recipient) io.to(recipient._id.toString()).emit('new_message', populated);
    } catch (_) {}

    // Notify the other participant (offline email)
    if (recipient) {
      const preview = text ? (text.length > 80 ? text.slice(0, 80) + '…' : text) : 'Sent an inspection date proposal.';
      const emailTpl = emailTemplates.newMessage(req.user.name, preview);
      await sendNotification({
        recipientId:         recipient._id,
        recipientEmail:      recipient.email,
        title:               `New message from ${req.user.name}`,
        message:             preview,
        type:                'message',
        relatedConversation: conv._id,
        emailSubject:        emailTpl.subject,
        emailHtml:           emailTpl.html,
      });
    }

    return ok(res, { message: populated }, 'Message sent.', 201);
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/chat/:convId/messages/:msgId/proposal
const respondToProposal = async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'declined'
    const message = await Message.findByIdAndUpdate(
      req.params.msgId,
      { proposalStatus: status },
      { new: true }
    ).populate('sender', 'name');

    if (status === 'accepted') {
      await Conversation.findByIdAndUpdate(req.params.convId, { visitStage: 'agreed' });
    }
    if (status === 'declined') {
      await Conversation.findByIdAndUpdate(req.params.convId, { visitStage: 'requested' });
    }

    try {
      const io = getIO();
      io.to(req.params.convId).emit('proposal_updated', message);
    } catch (_) {}

    return ok(res, { message }, `Proposal ${status}.`);
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/chat/upload
const uploadChatFile = async (req, res) => {
  try {
    // Enforce size limits: images ≤ 5 MB, videos ≤ 30 MB
    const file = req.files?.media;
    if (!file) return fail(res, 'No file uploaded.', 400);
    const f = Array.isArray(file) ? file[0] : file;
    const isVideo = (f.mimetype || '').startsWith('video/');
    const limitMB = isVideo ? 30 : 5;
    const sizeMB  = f.size / (1024 * 1024);
    if (sizeMB > limitMB) {
      return fail(res, `File too large. Maximum ${limitMB} MB allowed for ${isVideo ? 'videos' : 'images'} in chat.`, 400);
    }
    if (!req.uploadedUrls?.length) return fail(res, 'Upload failed.', 400);
    return ok(res, { url: req.uploadedUrls[0] });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/chat/start-direct — direct user-to-user conversation (no property)
const startDirectConversation = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return fail(res, 'userId required.', 400);
    if (userId.toString() === req.user._id.toString()) return fail(res, 'Cannot message yourself.', 400);

    let conv = await Conversation.findOne({
      property: null,
      participants: { $all: [req.user._id, userId], $size: 2 },
    });

    if (!conv) {
      conv = await Conversation.create({
        property: null,
        participants: [req.user._id, userId],
      });
    }

    await conv.populate('participants', 'name avatar');

    return ok(res, { conversation: conv }, 'Conversation ready.', 201);
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getConversations, getMessages, startConversation, startDirectConversation, sendMessage, respondToProposal, uploadChatFile };
