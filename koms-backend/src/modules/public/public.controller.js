import rateLimit from 'express-rate-limit';
import MenuCategory from '../menu/menu-category.model.js';
import MenuItem from '../menu/menu-item.model.js';
import Table from '../table/table.model.js';
import Order, { AWAITING_CONFIRMATION } from '../order/order.model.js';
import { buildOrderItems } from '../order/order.controller.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { getIO } from '../../config/socket.js';

const CUSTOMER_SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/;

export const publicOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many order submissions. Please try again in a minute.' },
});

async function findPublicTable(token) {
  const table = await Table.findOne({ publicToken: token }).select('_id name status');
  if (!table) throw new ApiError(404, 'Table not found');
  return table;
}

function publicOrderSummary(order, appended) {
  return {
    orderId: order._id,
    table: order.table,
    status: order.status,
    totalAmount: order.totalAmount,
    itemCount: order.items.length,
    appended,
  };
}

async function emitAwaitingConfirmation(order) {
  const populated = await order.populate([
    { path: 'table', select: 'name capacity status' },
    { path: 'items.menuItem', select: 'name category isAvailable prepTimeMinutes' },
  ]);
  getIO().to('waiters:confirmation').emit('order:awaitingConfirmation', populated);
}

export const getPublicMenu = asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ isAvailable: true })
    .select('name price category description prepTimeMinutes')
    .sort('name')
    .lean();
  const categoryIds = [...new Set(items.map((item) => item.category.toString()))];
  const categories = await MenuCategory.find({ _id: { $in: categoryIds } })
    .select('name displayOrder')
    .sort('displayOrder name')
    .lean();
  res.status(200).json(new ApiResponse(200, { categories, items }, 'Public menu fetched'));
});

export const getPublicTable = asyncHandler(async (req, res) => {
  const table = await findPublicTable(req.params.token);
  res.status(200).json(new ApiResponse(200, { name: table.name }, 'Table found'));
});

export const submitPublicOrder = asyncHandler(async (req, res) => {
  const { customerSessionId, items } = req.body || {};
  if (typeof customerSessionId !== 'string' || !CUSTOMER_SESSION_ID.test(customerSessionId)) {
    throw new ApiError(400, 'A valid customer session is required');
  }

  const table = await findPublicTable(req.params.token);
  if (table.status !== 'occupied') {
    throw new ApiError(409, "This table isn't currently available for ordering");
  }

  const orderItems = await buildOrderItems(items);
  const addedAmount = orderItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const matchingTicket = {
    table: table._id,
    source: 'customer',
    customerSessionId,
    status: AWAITING_CONFIRMATION,
  };

  let order = await Order.findOneAndUpdate(
    matchingTicket,
    { $push: { items: { $each: orderItems } }, $inc: { totalAmount: addedAmount } },
    { new: true }
  );
  if (order) {
    await emitAwaitingConfirmation(order);
    res.status(200).json(new ApiResponse(200, publicOrderSummary(order, true), 'Items added for waiter confirmation'));
    return;
  }

  try {
    order = await Order.create({
      table: table._id,
      source: 'customer',
      status: AWAITING_CONFIRMATION,
      customerSessionId,
      items: orderItems,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    order = await Order.findOneAndUpdate(
      matchingTicket,
      { $push: { items: { $each: orderItems } }, $inc: { totalAmount: addedAmount } },
      { new: true }
    );
    if (!order) throw error;
    res.status(200).json(new ApiResponse(200, publicOrderSummary(order, true), 'Items added for waiter confirmation'));
    return;
  }

  await emitAwaitingConfirmation(order);
  res.status(201).json(new ApiResponse(201, publicOrderSummary(order, false), 'Order sent to waiter for confirmation'));
});
