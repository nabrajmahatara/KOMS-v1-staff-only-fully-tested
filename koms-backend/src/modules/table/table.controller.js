import Table, { TABLE_STATUSES } from './table.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { generatePublicToken } from '../../utils/publicToken.js';

export const createTable = asyncHandler(async (req, res) => {
  const { name, capacity, status } = req.body;
  if (!name || capacity === undefined) throw new ApiError(400, 'name and capacity are required');
  const table = await Table.create({ name, capacity, status });
  res.status(201).json(new ApiResponse(201, table, 'Table created'));
});

export const getTables = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const tables = await Table.find(filter).sort('name');
  res.status(200).json(new ApiResponse(200, tables, 'Tables fetched'));
});

export const getTable = asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) throw new ApiError(404, 'Table not found');
  res.status(200).json(new ApiResponse(200, table, 'Table fetched'));
});

export const updateTable = asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) throw new ApiError(404, 'Table not found');
  const { name, capacity, status } = req.body;
  if (name !== undefined) table.name = name;
  if (capacity !== undefined) table.capacity = capacity;
  if (status !== undefined) table.status = status;
  await table.save();
  res.status(200).json(new ApiResponse(200, table, 'Table updated'));
});

export const updateTableStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!TABLE_STATUSES.includes(status)) throw new ApiError(400, 'Invalid table status');
  const table = await Table.findById(req.params.id);
  if (!table) throw new ApiError(404, 'Table not found');
  table.status = status;
  await table.save();
  res.status(200).json(new ApiResponse(200, table, 'Table status updated'));
});

export const regeneratePublicToken = asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) throw new ApiError(404, 'Table not found');

  table.publicToken = generatePublicToken();
  await table.save();
  res.status(200).json(new ApiResponse(200, table, 'Table public token regenerated'));
});

export const deleteTable = asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) throw new ApiError(404, 'Table not found');
  if (table.status === 'occupied') throw new ApiError(409, 'An occupied table cannot be deleted');
  await table.deleteOne();
  res.status(200).json(new ApiResponse(200, null, 'Table deleted'));
});
