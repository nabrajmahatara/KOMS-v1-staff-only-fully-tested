import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route.js';
import notificationRoutes from '../modules/notification/notification.routes.js';
import tableRoutes from '../modules/table/table.routes.js';
import menuRoutes from '../modules/menu/menu.routes.js';
import orderRoutes from '../modules/order/order.routes.js';
import reportRoutes from '../modules/report/report.routes.js';
import publicRoutes from '../modules/public/public.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tables', tableRoutes);
router.use('/menu', menuRoutes);
router.use('/orders', orderRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/public', publicRoutes);

export default router;
