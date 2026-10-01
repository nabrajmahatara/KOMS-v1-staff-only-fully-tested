import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import MenuCategory from '../menu/menu-category.model.js';
import MenuItem from '../menu/menu-item.model.js';
import Table from '../table/table.model.js';
import Order, { AWAITING_CONFIRMATION } from '../order/order.model.js';
import { buildOrderItems } from '../order/order.controller.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { getIO } from '../../config/socket.js';
import { claimFreeTable } from '../table/table.service.js';

const CUSTOMER_SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/;

export const publicOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many order submissions. Please try again in a minute.' },
});

export const publicTableOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many order submissions. Please try again in a minute.' },
});

async function findPublicTable(token) {
  const table = await Table.findOne({ publicToken: token }).select('_id name status');
  if (!table) throw new ApiError(404, 'Table not found');
  return table;
}

async function findPublicTableById(tableId) {
  if (!mongoose.isValidObjectId(tableId)) throw new ApiError(404, 'Table not found');
  const table = await Table.findById(tableId).select('_id name status');
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

async function prepareCustomerOrder(body) {
  const { customerSessionId, items } = body || {};
  if (typeof customerSessionId !== 'string' || !CUSTOMER_SESSION_ID.test(customerSessionId)) {
    throw new ApiError(400, 'A valid customer session is required');
  }
  const orderItems = await buildOrderItems(items);
  const addedAmount = orderItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  return { customerSessionId, orderItems, addedAmount };
}

function assertTableIsOccupied(table) {
  if (table.status !== 'occupied') {
    throw new ApiError(409, "This table isn't currently available for ordering");
  }
}

async function createOrAppendCustomerOrder(table, { customerSessionId, orderItems, addedAmount }) {
  const matchingTicket = { table: table._id, source: 'customer', customerSessionId, status: AWAITING_CONFIRMATION };
  let order = await Order.findOneAndUpdate(
    matchingTicket,
    { $push: { items: { $each: orderItems } }, $inc: { totalAmount: addedAmount } },
    { new: true }
  );
  if (order) {
    await emitAwaitingConfirmation(order);
    return { order, appended: true };
  }

  try {
    order = await Order.create({ table: table._id, source: 'customer', status: AWAITING_CONFIRMATION, customerSessionId, items: orderItems });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    order = await Order.findOneAndUpdate(
      matchingTicket,
      { $push: { items: { $each: orderItems } }, $inc: { totalAmount: addedAmount } },
      { new: true }
    );
    if (!order) throw error;
    return { order, appended: true };
  }
  await emitAwaitingConfirmation(order);
  return { order, appended: false };
}

async function releaseExpectedFailedQrClaim(tableId) {
  const hasActiveOrders = await Order.exists({
    table: tableId,
    status: { $nin: ['paid', 'cancelled'] },
  });
  if (!hasActiveOrders) {
    await Table.updateOne({ _id: tableId, status: 'occupied' }, { $set: { status: 'free' } });
  }
}

async function claimOrUseQrTable(table) {
  if (table.status === 'occupied') return { table, claimedFreeTable: false };
  if (table.status === 'reserved') throw new ApiError(409, "This table isn't currently available for ordering");

  const claimedTable = await claimFreeTable(table._id);
  if (claimedTable) return { table: claimedTable, claimedFreeTable: true };

  // Another request may have claimed the table between the token lookup and
  // our conditional update. Re-read its current state before deciding.
  const currentTable = await Table.findById(table._id).select('_id name status');
  if (!currentTable) throw new ApiError(404, 'Table not found');
  assertTableIsOccupied(currentTable);
  return { table: currentTable, claimedFreeTable: false };
}

export const getPublicMenu = asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ isAvailable: true })
    .select('name price category description imageUrl prepTimeMinutes')
    .sort('name')
    .lean();
  const categoryIds = [...new Set(items.map((item) => item.category.toString()))];
  const categories = await MenuCategory.find({ _id: { $in: categoryIds } })
    .select('name displayOrder imageUrl')
    .sort('displayOrder name')
    .lean();
  res.status(200).json(new ApiResponse(200, { categories, items }, 'Public menu fetched'));
});

export const getOccupiedPublicTables = asyncHandler(async (req, res) => {
  const tables = await Table.find({ status: 'occupied' }).select('_id name').sort('name').lean();
  res.status(200).json(new ApiResponse(200, tables, 'Occupied tables fetched'));
});

export const getPublicTable = asyncHandler(async (req, res) => {
  const table = await findPublicTable(req.params.token);
  res.status(200).json(new ApiResponse(200, { name: table.name }, 'Table found'));
});

export const submitPublicOrder = asyncHandler(async (req, res) => {
  // Validate the complete request before a QR scan may change table state.
  const preparedOrder = await prepareCustomerOrder(req.body);
  const requestedTable = await findPublicTable(req.params.token);
  const { table, claimedFreeTable } = await claimOrUseQrTable(requestedTable);
  let result;
  try {
    result = await createOrAppendCustomerOrder(table, preparedOrder);
  } catch (error) {
    if (claimedFreeTable && error instanceof ApiError) {
      await releaseExpectedFailedQrClaim(table._id);
    } else if (claimedFreeTable) {
      // Do not free a table after an unexpected failure. A staff member can
      // safely resolve a visible occupied table; freeing a seated table is worse.
      console.error(`[QR_ORDER_CLAIM_FAILURE] table=${table._id} order creation failed after claim; table remains occupied`, error);
    }
    throw error;
  }
  const { order, appended } = result;
  const statusCode = appended ? 200 : 201;
  res.status(statusCode).json(new ApiResponse(statusCode, publicOrderSummary(order, appended), appended ? 'Items added for waiter confirmation' : 'Order sent to waiter for confirmation'));
});

export const submitPublicTableOrder = asyncHandler(async (req, res) => {
  const table = await findPublicTableById(req.params.tableId);
  // The table-picker path has no proof that the caller is seated here.
  // It deliberately never claims a free table.
  assertTableIsOccupied(table);
  const preparedOrder = await prepareCustomerOrder(req.body);
  const { order, appended } = await createOrAppendCustomerOrder(table, preparedOrder);
  const statusCode = appended ? 200 : 201;
  res.status(statusCode).json(new ApiResponse(statusCode, publicOrderSummary(order, appended), appended ? 'Items added for waiter confirmation' : 'Order sent to waiter for confirmation'));
});
