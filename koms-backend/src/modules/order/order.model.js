import mongoose from 'mongoose';
import { PRIORITIES, PRIORITY_VALUES } from '../../constants/priorities.js';

export const ORDER_STATUSES = ['awaiting_confirmation', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
export const ORDER_SOURCES = ['staff', 'customer'];
export const AWAITING_CONFIRMATION = 'awaiting_confirmation';
export const ITEM_STATUSES = ['pending', 'preparing', 'ready', 'served', 'cancelled'];

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    nameSnapshot: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    notes: { type: String, trim: true, default: '' },
    itemStatus: { type: String, enum: ITEM_STATUSES, default: 'pending' },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    waiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required() {
        return !(this.source === 'customer' && [AWAITING_CONFIRMATION, 'cancelled'].includes(this.status));
      },
    },
    items: { type: [orderItemSchema], validate: [(items) => items.length > 0, 'An order needs at least one item'] },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    source: { type: String, enum: ORDER_SOURCES, default: 'staff', required: true },
    customerSessionId: { type: String, trim: true, default: undefined },
    rejectionReason: { type: String, trim: true, default: '' },
    priority: { type: String, enum: PRIORITY_VALUES, default: PRIORITIES.NORMAL },
    totalAmount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

orderSchema.pre('validate', function () {
  this.totalAmount = this.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
});

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ table: 1, createdAt: -1 });
orderSchema.index({ waiter: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ table: 1, source: 1, customerSessionId: 1, status: 1 });
orderSchema.index(
  { table: 1, source: 1, customerSessionId: 1, status: 1 },
  {
    unique: true,
    name: 'one_awaiting_customer_ticket_per_session',
    partialFilterExpression: { source: 'customer', status: AWAITING_CONFIRMATION },
  }
);

export default mongoose.model('Order', orderSchema);
