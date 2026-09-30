import Notification from './notification.model.js';
import { getIO } from '../../config/socket.js';

export async function createNotification({ recipient, type, message, relatedOrder }) {
  const notification = await Notification.create({ recipient, type, message, relatedOrder });

  try {
    getIO().to(`user:${recipient}`).emit('notification:new', notification);
  } catch (err) {
  }

  return notification;
}
