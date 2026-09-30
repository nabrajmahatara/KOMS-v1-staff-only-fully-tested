import mongoose from 'mongoose';
import { generatePublicToken } from '../../utils/publicToken.js';

export const TABLE_STATUSES = ['free', 'occupied', 'reserved'];

const tableSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'table name or number is required'], trim: true, unique: true },
    capacity: { type: Number, required: true, min: [1, 'capacity must be at least 1'] },
    status: { type: String, enum: TABLE_STATUSES, default: 'free' },
    publicToken: {
      type: String,
      required: true,
      unique: true,
      immutable: false,
      default: generatePublicToken,
    },
  },
  { timestamps: true }
);

tableSchema.index({ status: 1 });

export default mongoose.model('Table', tableSchema);
