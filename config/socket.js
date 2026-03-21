const { Server } = require('socket.io');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ['GET', 'POST'],
    },
  });

  // Track online users: userId -> socketId
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // User comes online
    socket.on('user_online', (userId) => {
      onlineUsers.set(userId, socket.id);
      io.emit('online_users', Array.from(onlineUsers.keys()));
    });

    // Join a conversation room
    socket.on('join_room', (convId) => {
      socket.join(convId);
    });

    // Leave a conversation room
    socket.on('leave_room', (convId) => {
      socket.leave(convId);
    });

    // Typing indicator
    socket.on('typing', ({ convId, userId }) => {
      socket.to(convId).emit('typing', { userId });
    });

    socket.on('stop_typing', ({ convId, userId }) => {
      socket.to(convId).emit('stop_typing', { userId });
    });

    // Read receipt
    socket.on('mark_read', ({ convId, userId }) => {
      socket.to(convId).emit('messages_read', { userId });
    });

    // User disconnects
    socket.on('disconnect', () => {
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      io.emit('online_users', Array.from(onlineUsers.keys()));
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialised');
  return io;
};

module.exports = { initSocket, getIO };
