import Order, { ITEM_STATUSES, ORDER_STATUSES } from './order.model.js';
import mongoose from 'mongoose';
import Table from '../table/table.model.js';
import MenuItem from '../menu/menu-item.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { ROLES } from '../../constants/roles.js';
import User from '../auth/user.model.js';
import { createNotification } from '../notification/notification.service.js';
import { getIO } from '../../config/socket.js';
import { claimFreeTable } from '../table/table.service.js';

const editableStatuses = ['pending', 'confirmed'];
const terminalStatuses = ['paid', 'cancelled'];
const transitions = {
  awaiting_confirmation: ['pending', 'cancelled'],
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};
const itemTransitions = {
  pending: ['preparing'],
  preparing: ['ready'],
  ready: ['served'],
  served: [],
  cancelled: [],
};

async function populateOrder(order) {
  return order.populate([
    { path: 'table', select: 'name capacity status' },
    { path: 'waiter', select: 'username email role' },
    { path: 'items.menuItem', select: 'name category isAvailable prepTimeMinutes' },
  ]);
}

function assertWaiterOwnsOrder(order, user) {
  if (user.role !== ROLES.WAITER || order.waiter.toString() !== user._id.toString()) {
    throw new ApiError(403, 'Only the waiter who created this order can change its items');
  }
}

function assertCanViewOrder(order, user) {
  if (user.role === ROLES.WAITER && order.waiter.toString() !== user._id.toString()) {
    throw new ApiError(403, 'Waiters can view only their own orders');
  }
}

export async function buildOrderItems(requestedItems) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new ApiError(400, 'items must contain at least one menu item');
  }
  if (requestedItems.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new ApiError(400, 'Each item must be an object');
  }
  const ids = requestedItems.map((item) => item.menuItem);
  if (ids.some((id) => !id || !mongoose.isValidObjectId(id))) {
    throw new ApiError(400, 'Each item must include a valid menuItem');
  }
  const menuItems = await MenuItem.find({ _id: { $in: ids }, isAvailable: true });
  if (menuItems.length !== new Set(ids.map((id) => id.toString())).size) {
    throw new ApiError(400, 'Every requested menu item must exist and be available');
  }
  const menuById = new Map(menuItems.map((item) => [item._id.toString(), item]));
  return requestedItems.map(({ menuItem, quantity, notes }) => {
    if (!Number.isInteger(quantity) || quantity < 1) throw new ApiError(400, 'Each item quantity must be a positive integer');
    if (notes !== undefined && typeof notes !== 'string') throw new ApiError(400, 'Each item notes must be text');
    const item = menuById.get(menuItem.toString());
    return { menuItem: item._id, nameSnapshot: item.name, unitPrice: item.price, quantity, notes };
  });
}

async function releaseTableIfClosed(order) {
  if (!terminalStatuses.includes(order.status)) return;
  const hasOtherActiveOrders = await Order.exists({
    table: order.table,
    _id: { $ne: order._id },
    status: { $nin: terminalStatuses },
  });
  if (!hasOtherActiveOrders) {
    await Table.findByIdAndUpdate(order.table, { status: 'free' });
  }
}

function emit(room, event, payload) {
  getIO().to(room).emit(event, payload);
}

async function notifyKitchen(order, type, message) {
  const kitchenUsers = await User.find({ role: ROLES.KITCHEN_STAFF, isActive: true }).select('_id');
  await Promise.all(kitchenUsers.map((user) => createNotification({
    recipient: user._id,
    type,
    message,
    relatedOrder: order._id,
  })));
}

async function sendOrderToKitchen(order) {
  const populated = await populateOrder(order);
  await notifyKitchen(order, 'NEW_ORDER', `New ${order.priority} order for table ${populated.table.name}`);
  emit('kitchen:orders', 'order:new', populated);
  return populated;
}

export const createOrder = asyncHandler(async (req, res) => {
  const { table: tableId, items, priority } = req.body;
  if (!tableId) throw new ApiError(400, 'table is required');
  const orderItems = await buildOrderItems(items);

  const table = await claimFreeTable(tableId);
  if (!table) {
    const tableExists = await Table.exists({ _id: tableId });
    if (!tableExists) throw new ApiError(404, 'Table not found');
    throw new ApiError(409, 'Table is no longer free. Choose another table.');
  }

  let order;
  try {
    order = await Order.create({ table: table._id, waiter: req.user._id, items: orderItems, priority });
  } catch (error) {
    await Table.updateOne({ _id: table._id, status: 'occupied' }, { status: 'free' });
    throw error;
  }

  const populated = await sendOrderToKitchen(order);
  res.status(201).json(new ApiResponse(201, populated, 'Order created'));
});

export const getAwaitingConfirmationOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ source: 'customer', status: 'awaiting_confirmation' }).sort('createdAt');
  await Order.populate(orders, [
    { path: 'table', select: 'name capacity status' },
    { path: 'items.menuItem', select: 'name category isAvailable prepTimeMinutes' },
  ]);
  res.status(200).json(new ApiResponse(200, orders, 'Customer orders awaiting confirmation fetched'));
});

export const reviewCustomerOrder = asyncHandler(async (req, res) => {
  const { action, rejectionReason } = req.body || {};
  if (!['confirm', 'reject'].includes(action)) {
    throw new ApiError(400, 'action must be confirm or reject');
  }
  if (rejectionReason !== undefined && typeof rejectionReason !== 'string') {
    throw new ApiError(400, 'rejectionReason must be text');
  }

  const order = await Order.findById(req.params.id);
  if (!order || order.source !== 'customer') throw new ApiError(404, 'Customer order not found');
  if (order.status !== 'awaiting_confirmation') {
    throw new ApiError(409, 'This customer order has already been reviewed');
  }

  if (action === 'reject') {
    order.status = 'cancelled';
    order.rejectionReason = rejectionReason?.trim() || '';
    order.items.forEach((item) => { item.itemStatus = 'cancelled'; });
    await order.save();
    await releaseTableIfClosed(order);
    const populated = await populateOrder(order);
    emit('waiters:confirmation', 'order:confirmationUpdated', populated);
    res.status(200).json(new ApiResponse(200, populated, 'Customer order rejected'));
    return;
  }

  order.waiter = req.user._id;
  order.status = 'pending';
  await order.save();
  const populated = await sendOrderToKitchen(order);
  emit('waiters:confirmation', 'order:confirmationUpdated', populated);
  res.status(200).json(new ApiResponse(200, populated, 'Customer order confirmed and sent to kitchen'));
});

export const getOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.WAITER) filter.waiter = req.user._id;
  if (req.query.status) filter.status = { $in: req.query.status.split(',') };
  if (req.query.table) filter.table = req.query.table;
  if (req.query.date || req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.date) {
      const date = new Date(req.query.date);
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      filter.createdAt.$gte = date;
      filter.createdAt.$lt = nextDate;
    } else {
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }
  }
  const orders = await Order.find(filter).sort('-createdAt');
  await Order.populate(orders, [
    { path: 'table', select: 'name capacity status' },
    { path: 'waiter', select: 'username email role' },
    { path: 'items.menuItem', select: 'name category isAvailable prepTimeMinutes' },
  ]);
  res.status(200).json(new ApiResponse(200, orders, 'Orders fetched'));
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  assertCanViewOrder(order, req.user);
  res.status(200).json(new ApiResponse(200, await populateOrder(order), 'Order fetched'));
});

export const addOrderItem = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  assertWaiterOwnsOrder(order, req.user);
  if (!editableStatuses.includes(order.status)) throw new ApiError(409, 'Items cannot be changed after preparation starts');
  const [item] = await buildOrderItems([req.body]);
  order.items.push(item);
  await order.save();
  res.status(200).json(new ApiResponse(200, await populateOrder(order), 'Order item added'));
});

export const removeOrderItem = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  assertWaiterOwnsOrder(order, req.user);
  if (!editableStatuses.includes(order.status)) throw new ApiError(409, 'Items cannot be changed after preparation starts');
  const item = order.items.id(req.params.itemId);
  if (!item) throw new ApiError(404, 'Order item not found');
  if (order.items.length === 1) throw new ApiError(400, 'Cancel the order instead of removing its final item');
  item.deleteOne();
  await order.save();
  res.status(200).json(new ApiResponse(200, await populateOrder(order), 'Order item removed'));
});

export const updateItemStatus = asyncHandler(async (req, res) => {
  const { itemStatus } = req.body;
  if (!ITEM_STATUSES.includes(itemStatus)) throw new ApiError(400, 'Invalid item status');
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (terminalStatuses.includes(order.status)) throw new ApiError(409, 'A closed order cannot be changed');
  const item = order.items.id(req.params.itemId);
  if (!item) throw new ApiError(404, 'Order item not found');

  const isKitchenOrOwner = [ROLES.KITCHEN_STAFF, ROLES.OWNER].includes(req.user.role);
  const isAssignedWaiter = req.user.role === ROLES.WAITER && order.waiter?.toString() === req.user._id.toString();
  const waiterCanServeReadyItem = isAssignedWaiter && item.itemStatus === 'ready' && itemStatus === 'served';
  if (!isKitchenOrOwner && !waiterCanServeReadyItem) {
    throw new ApiError(403, 'Waiters can only mark their own ready items as served');
  }

  if (!itemTransitions[item.itemStatus].includes(itemStatus)) {
    throw new ApiError(400, `Cannot change an item from ${item.itemStatus} to ${itemStatus}`);
  }
  const waiterId = order.waiter.toString();
  const previousOrderStatus = order.status;
  item.itemStatus = itemStatus;
  if (itemStatus === 'preparing' && ['pending', 'confirmed'].includes(order.status)) order.status = 'preparing';
  if (order.items.every((entry) => entry.itemStatus === 'ready')) order.status = 'ready';
  if (order.items.every((entry) => entry.itemStatus === 'served')) order.status = 'served';
  await order.save();
  const populated = await populateOrder(order);
  emit('kitchen:orders', 'order:updated', populated);
  emit('cashier:orders', 'order:updated', populated);
  emit(`user:${waiterId}`, 'order:itemUpdated', { orderId: order._id, itemId: item._id, itemStatus, orderStatus: order.status });
  if (order.status === 'ready' && previousOrderStatus !== 'ready') {
    const message = `Order for table ${populated.table.name} is ready to serve`;
    await createNotification({ recipient: waiterId, type: 'ORDER_READY', message, relatedOrder: order._id });
    emit(`user:${waiterId}`, 'order:ready', populated);
  }
  res.status(200).json(new ApiResponse(200, populated, 'Order item status updated'));
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.includes(status)) throw new ApiError(400, 'Invalid order status');
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  assertCanViewOrder(order, req.user);
  if (!transitions[order.status].includes(status)) throw new ApiError(400, `Cannot change an order from ${order.status} to ${status}`);

  const isOwner = req.user.role === ROLES.OWNER;
  const isWaiterOwner = req.user.role === ROLES.WAITER && order.waiter.toString() === req.user._id.toString();
  const allowed =
    (status === 'confirmed' && (isWaiterOwner || isOwner || req.user.role === ROLES.MANAGER)) ||
    (status === 'served' && (isWaiterOwner || isOwner || req.user.role === ROLES.MANAGER)) ||
    (status === 'paid' && (req.user.role === ROLES.CASHIER || isOwner)) ||
    (status === 'cancelled' && (isWaiterOwner || isOwner || req.user.role === ROLES.MANAGER));
  if (!allowed) throw new ApiError(403, 'Your role cannot make this status change');

  order.status = status;
  if (status === 'cancelled') order.items.forEach((item) => { item.itemStatus = 'cancelled'; });
  await order.save();
  await releaseTableIfClosed(order);
  const populated = await populateOrder(order);
  if (status === 'cancelled') {
    await notifyKitchen(order, 'ORDER_CANCELLED', `Order for table ${populated.table.name} was cancelled`);
  }
  emit('kitchen:orders', 'order:updated', populated);
  emit('cashier:orders', 'order:updated', populated);
  res.status(200).json(new ApiResponse(200, populated, 'Order status updated'));
});
