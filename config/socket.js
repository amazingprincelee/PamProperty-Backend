const { Server } = require('socket.io');

let io;
const onlineUsers = new Map(); // userId -> socketId (module-scoped)

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // User comes online — join personal room so io.to(userId) works
    socket.on('user_online', (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.join(userId);
      io.emit('online_users', Array.from(onlineUsers.keys()));
    });

    socket.on('join_room',   (convId) => socket.join(convId));
    socket.on('leave_room',  (convId) => socket.leave(convId));

    socket.on('typing',      ({ convId, userId }) => socket.to(convId).emit('typing', { userId }));
    socket.on('stop_typing', ({ convId, userId }) => socket.to(convId).emit('stop_typing', { userId }));
    socket.on('mark_read',   ({ convId, userId }) => socket.to(convId).emit('messages_read', { userId }));

    socket.on('disconnect', () => {
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) { onlineUsers.delete(userId); break; }
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

const isUserOnline = (userId) => {
  if (!userId) return false;
  return onlineUsers.has(userId.toString());
};

module.exports = { initSocket, getIO, isUserOnline };
