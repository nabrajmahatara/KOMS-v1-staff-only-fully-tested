import User from './user.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { generateToken } from '../../utils/generateToken.js';
import { ROLES } from '../../constants/roles.js';

const STAFF_ROLES = [ROLES.MANAGER, ROLES.WAITER, ROLES.KITCHEN_STAFF, ROLES.CASHIER];

function isOwnerIndexConflict(error) {
  return error?.code === 11000 && error?.keyPattern?.role;
}

export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    throw new ApiError(400, 'username, email and password are required');
  }

  await User.init();
  const ownerExists = await User.exists({ role: ROLES.OWNER });
  if (ownerExists) {
    throw new ApiError(403, 'Self-registration is closed. Ask an owner or manager to create your staff account.');
  }

  let user;
  try {
    user = await User.create({ username, email, password, role: ROLES.OWNER });
  } catch (error) {
    if (isOwnerIndexConflict(error)) {
      throw new ApiError(403, 'Self-registration is closed. An owner account was created concurrently.');
    }
    throw error;
  }
  const token = generateToken({ id: user._id });

  res.status(201).json(new ApiResponse(201, { user: user.toSafeObject(), token }, 'Registered successfully'));
});

export const login = asyncHandler(async (req, res) => {
  const { emailOrUsername, password } = req.body;
  if (!emailOrUsername || !password) {
    throw new ApiError(400, 'emailOrUsername and password are required');
  }

  const user = await User.findOne({
    $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername.toLowerCase() }],
  }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid credentials');
  }
  if (!user.isActive) throw new ApiError(403, 'This account has been deactivated');

  const token = generateToken({ id: user._id });
  res.status(200).json(new ApiResponse(200, { user: user.toSafeObject(), token }, 'Logged in successfully'));
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, req.user, 'Current user fetched'));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { username } = req.body;
  const user = await User.findById(req.user._id);

  if (username) user.username = username;

  await user.save();
  res.status(200).json(new ApiResponse(200, user.toSafeObject(), 'Profile updated'));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  user.password = newPassword;
  await user.save();

  res.status(200).json(new ApiResponse(200, null, 'Password changed successfully'));
});

export const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) throw new ApiError(400, "Search query 'q' is required");

  const users = await User.find({
    $or: [{ username: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }],
  })
    .select('username email role isActive')
    .limit(10);

  res.status(200).json(new ApiResponse(200, users, 'Users fetched'));
});

export const createStaff = asyncHandler(async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password || !role) {
    throw new ApiError(400, 'username, email, password and role are required');
  }
  if (!STAFF_ROLES.includes(role)) {
    throw new ApiError(400, 'Staff role must be manager, waiter, kitchen_staff, or cashier');
  }
  if (role === ROLES.MANAGER && req.user.role !== ROLES.OWNER) {
    throw new ApiError(403, 'Only the owner can create a manager account');
  }

  const user = await User.create({ username, email, password, role });
  res.status(201).json(new ApiResponse(201, user.toSafeObject(), 'Staff account created'));
});

export const getStaff = asyncHandler(async (req, res) => {
  const staff = await User.find({ role: { $in: STAFF_ROLES } })
    .select('username email role isActive createdAt')
    .sort('role username');
  res.status(200).json(new ApiResponse(200, staff, 'Staff fetched'));
});

async function setStaffActive(req, res, isActive) {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === ROLES.OWNER) {
    throw new ApiError(400, 'The owner account cannot be deactivated or reactivated through this endpoint');
  }

  user.isActive = isActive;
  await user.save();
  res.status(200).json(new ApiResponse(200, user.toSafeObject(), `Staff account ${isActive ? 'reactivated' : 'deactivated'}`));
}

export const deactivateStaff = asyncHandler(async (req, res) => setStaffActive(req, res, false));
export const reactivateStaff = asyncHandler(async (req, res) => setStaffActive(req, res, true));
