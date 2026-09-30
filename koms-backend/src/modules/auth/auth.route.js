import { Router } from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import { register, login, getMe, updateProfile, changePassword, searchUsers, createStaff, getStaff, deactivateStaff, reactivateStaff } from './auth.controller.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/create-staff', protect, authorize(ROLES.OWNER, ROLES.MANAGER), createStaff);
router.get('/staff', protect, authorize(ROLES.OWNER, ROLES.MANAGER), getStaff);
router.patch('/staff/:id/deactivate', protect, authorize(ROLES.OWNER, ROLES.MANAGER), deactivateStaff);
router.patch('/staff/:id/reactivate', protect, authorize(ROLES.OWNER, ROLES.MANAGER), reactivateStaff);
router.get('/me', protect, getMe);
router.patch('/update-profile', protect, updateProfile);
router.patch('/change-password', protect, changePassword);
router.get('/search', protect, authorize(ROLES.OWNER, ROLES.MANAGER), searchUsers);

export default router;
