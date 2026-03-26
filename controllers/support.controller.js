const Ticket = require('../models/Ticket');
const { sendNotification } = require('../services/notification.service');
const { ok, fail } = require('../utils/response');

// POST /api/support — create ticket
const createTicket = async (req, res) => {
  try {
    const { subject, category, message } = req.body;
    if (!subject || !message) return fail(res, 'Subject and message are required.', 400);

    const ticket = await Ticket.create({
      user:     req.user._id,
      subject:  subject.trim(),
      category: category || 'other',
      message:  message.trim(),
    });

    return ok(res, { ticket }, 'Ticket submitted. We\'ll get back to you within 24 hours.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/support/my — get my tickets
const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id })
      .select('-replies.sender')
      .sort({ updatedAt: -1 });
    return ok(res, { tickets });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/support/:id — get single ticket with replies
const getTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('user', 'name email avatar')
      .populate('replies.sender', 'name avatar role')
      .populate('assignedTo', 'name');

    if (!ticket) return fail(res, 'Ticket not found.', 404);

    // Users can only see their own tickets; admins can see all
    if (ticket.user._id.toString() !== req.user._id.toString() && !['admin', 'super_admin'].includes(req.user.role)) {
      return fail(res, 'Not authorised.', 403);
    }

    return ok(res, { ticket });
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/support/:id/reply — user or admin replies
const replyToTicket = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return fail(res, 'Message is required.', 400);

    const ticket = await Ticket.findById(req.params.id).populate('user', 'name email');
    if (!ticket) return fail(res, 'Ticket not found.', 404);

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = ticket.user._id.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) return fail(res, 'Not authorised.', 403);

    ticket.replies.push({
      sender:     req.user._id,
      senderRole: req.user.role,
      message:    message.trim(),
    });

    // Update status when admin replies
    if (isAdmin && ticket.status === 'open') {
      ticket.status = 'in_progress';
    }
    // If user replies to closed ticket, reopen it
    if (isOwner && ticket.status === 'closed') {
      ticket.status = 'open';
    }

    await ticket.save();

    // Notify the other party
    if (isAdmin) {
      await sendNotification({
        recipientId: ticket.user._id,
        title:       'Support Reply',
        message:     `Admin replied to your ticket: "${ticket.subject}"`,
        type:        'system',
      });
    }

    return ok(res, { ticket }, 'Reply sent.');
  } catch (err) {
    return fail(res, err.message);
  }
};

/* ─── ADMIN ─────────────────────────────────── */

// GET /api/admin/support — list all tickets (admin)
const getAllTickets = async (req, res) => {
  try {
    const { status, category, search } = req.query;
    const filter = {};
    if (status)   filter.status   = status;
    if (category) filter.category = category;
    if (search)   filter.$or = [
      { subject: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } },
    ];

    const tickets = await Ticket.find(filter)
      .populate('user', 'name email avatar')
      .populate('assignedTo', 'name')
      .sort({ updatedAt: -1 });

    return ok(res, { tickets });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/support/:id/status — update ticket status (admin)
const updateTicketStatus = async (req, res) => {
  try {
    const { status, priority } = req.body;
    const updates = {};
    if (status)   updates.status   = status;
    if (priority) updates.priority = priority;
    if (status === 'resolved') updates.resolvedAt = new Date();

    const ticket = await Ticket.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('user', 'name email');

    if (!ticket) return fail(res, 'Ticket not found.', 404);

    if (status === 'resolved') {
      await sendNotification({
        recipientId: ticket.user._id,
        title:       'Ticket Resolved',
        message:     `Your support ticket "${ticket.subject}" has been marked as resolved.`,
        type:        'system',
      });
    }

    return ok(res, { ticket }, `Ticket ${status || 'updated'}.`);
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { createTicket, getMyTickets, getTicket, replyToTicket, getAllTickets, updateTicketStatus };
