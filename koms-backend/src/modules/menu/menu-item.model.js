import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'menu item name is required'], trim: true },
    price: { type: Number, required: true, min: [0, 'price cannot be negative'] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuCategory', required: true },
    description: { type: String, trim: true, default: '' },
    isAvailable: { type: Boolean, default: true },
    prepTimeMinutes: { type: Number, default: 0, min: [0, 'prep time cannot be negative'] },
  },
  { timestamps: true }
);

menuItemSchema.index({ category: 1, name: 1 }, { unique: true });

export default mongoose.model('MenuItem', menuItemSchema);
