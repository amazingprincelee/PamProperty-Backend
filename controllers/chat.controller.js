const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const Property     = require('../models/Property');
const { getIO }    = require('../config/socket');
const { sendNotification } = require('../services/notification.service');
const { ok, fail } = require('../utils/response');

// GET /api/chat/conversations
const getConversations = async (req, res) => {
  try {
    const convs = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'name avatar')
      .populate('property', 'title images type')
      .sort({ lastTime: -1 });
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
    const { text, type = 'text', proposedDate, proposedTime, proposedNote } = req.body;
    const conv = await Conversation.findById(req.params.convId).populate('participants', 'name');
    if (!conv) return fail(res, 'Conversation not found.', 404);
    if (!conv.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return fail(res, 'Not authorised.', 403);
    }

    const message = await Message.create({
      conversation:  req.params.convId,
      sender:        req.user._id,
      type,
      text:          text || '',
      proposedDate:  proposedDate || null,
      proposedTime:  proposedTime || null,
      proposedNote:  proposedNote || null,
      readBy:        [req.user._id],
    });

    // Update conversation last message
    conv.lastMessage = text || '📅 Inspection date proposed';
    conv.lastTime    = new Date();
    conv.participants.forEach(p => {
      if (p._id.toString() !== req.user._id.toString()) {
        const current = conv.unreadCount.get(p._id.toString()) || 0;
        conv.unreadCount.set(p._id.toString(), current + 1);
      }
    });
    await conv.save();

    const populated = await message.populate('sender', 'name avatar');

    // Emit to conversation room via Socket.io
    try {
      const io = getIO();
      io.to(req.params.convId).emit('new_message', populated);
    } catch (_) {}

    // Notify the other participant
    const recipient = conv.participants.find(p => p._id.toString() !== req.user._id.toString());
    if (recipient) {
      await sendNotification({
        recipientId:         recipient._id,
        title:               `New message from ${req.user.name}`,
        message:             text || 'Sent an inspection date proposal.',
        type:                'message',
        relatedConversation: conv._id,
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

    try {
      const io = getIO();
      io.to(req.params.convId).emit('proposal_updated', message);
    } catch (_) {}

    return ok(res, { message }, `Proposal ${status}.`);
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getConversations, getMessages, startConversation, sendMessage, respondToProposal };
