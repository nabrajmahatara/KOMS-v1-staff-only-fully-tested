import mongoose from 'mongoose';

const menuCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'category name is required'], trim: true, unique: true },
    displayOrder: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('MenuCategory', menuCategorySchema);
