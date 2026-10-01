import MenuCategory from './menu-category.model.js';
import MenuItem from './menu-item.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';

const requireUploadedImage = (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith('/uploads/menu/')) {
    throw new ApiError(400, 'An uploaded menu image is required');
  }
};

export const uploadMenuImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'An image file is required');
  res.status(201).json(new ApiResponse(201, { imageUrl: `/uploads/menu/${req.file.filename}` }, 'Menu image uploaded'));
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, displayOrder, imageUrl } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  requireUploadedImage(imageUrl);
  const category = await MenuCategory.create({ name, displayOrder, imageUrl });
  res.status(201).json(new ApiResponse(201, category, 'Menu category created'));
});
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await MenuCategory.find().sort('displayOrder name');
  res.status(200).json(new ApiResponse(200, categories, 'Menu categories fetched'));
});
export const updateCategory = asyncHandler(async (req, res) => {
  const category = await MenuCategory.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Menu category not found');
  if (req.body.name !== undefined) category.name = req.body.name;
  if (req.body.displayOrder !== undefined) category.displayOrder = req.body.displayOrder;
  if (req.body.imageUrl !== undefined) {
    requireUploadedImage(req.body.imageUrl);
    category.imageUrl = req.body.imageUrl;
  }
  await category.save();
  res.status(200).json(new ApiResponse(200, category, 'Menu category updated'));
});
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await MenuCategory.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Menu category not found');
  if (await MenuItem.exists({ category: category._id })) throw new ApiError(409, 'Delete or move this category’s menu items first');
  await category.deleteOne();
  res.status(200).json(new ApiResponse(200, null, 'Menu category deleted'));
});

export const createMenuItem = asyncHandler(async (req, res) => {
  const { name, price, category, description, imageUrl, isAvailable, prepTimeMinutes } = req.body;
  if (!name || price === undefined || !category) throw new ApiError(400, 'name, price and category are required');
  if (!await MenuCategory.exists({ _id: category })) throw new ApiError(404, 'Menu category not found');
  requireUploadedImage(imageUrl);
  const item = await MenuItem.create({ name, price, category, description, imageUrl, isAvailable, prepTimeMinutes });
  res.status(201).json(new ApiResponse(201, item, 'Menu item created'));
});
export const getMenuItems = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.available !== undefined) filter.isAvailable = req.query.available === 'true';
  const items = await MenuItem.find(filter).populate('category', 'name displayOrder imageUrl').sort('name');
  res.status(200).json(new ApiResponse(200, items, 'Menu items fetched'));
});
export const updateMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Menu item not found');
  const { name, price, category, description, imageUrl, isAvailable, prepTimeMinutes } = req.body;
  if (category !== undefined && !await MenuCategory.exists({ _id: category })) throw new ApiError(404, 'Menu category not found');
  if (imageUrl !== undefined) requireUploadedImage(imageUrl);
  for (const [key, value] of Object.entries({ name, price, category, description, imageUrl, isAvailable, prepTimeMinutes })) {
    if (value !== undefined) item[key] = value;
  }
  await item.save();
  res.status(200).json(new ApiResponse(200, item, 'Menu item updated'));
});
export const toggleAvailability = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Menu item not found');
  item.isAvailable = req.body.isAvailable === undefined ? !item.isAvailable : req.body.isAvailable;
  await item.save();
  res.status(200).json(new ApiResponse(200, item, 'Menu item availability updated'));
});
export const deleteMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Menu item not found');
  await item.deleteOne();
  res.status(200).json(new ApiResponse(200, null, 'Menu item deleted'));
});
