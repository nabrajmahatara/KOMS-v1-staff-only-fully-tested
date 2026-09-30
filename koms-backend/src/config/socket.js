import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from './env.js';
import User from '../modules/auth/user.model.js';

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || config.isAllowedClientOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin is not allowed by CORS'));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication token missing'));

      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id).select('-password');
      if (!user || !user.isActive) return next(new Error('User not found or inactive'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.user.username} (${socket.id})`);
    socket.join(`user:${socket.user._id}`);

    if (['kitchen_staff', 'owner'].includes(socket.user.role)) {
      socket.join('kitchen:orders');
    }
    if (socket.user.role === 'cashier') {
      socket.join('cashier:orders');
    }
    if (socket.user.role === 'waiter') {
      socket.join('waiters:confirmation');
    }

    socket.on('disconnect', () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
