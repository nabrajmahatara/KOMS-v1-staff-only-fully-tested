import { Router } from 'express';
import { authorize, protect } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';
import * as order from './order.controller.js';

const router = Router();
router.use(protect);
router.get('/', order.getOrders);
router.get('/awaiting-confirmation', authorize(ROLES.WAITER), order.getAwaitingConfirmationOrders);
router.get('/:id', order.getOrder);
router.post('/', authorize(ROLES.WAITER), order.createOrder);
router.post('/:id/items', authorize(ROLES.WAITER), order.addOrderItem);
router.delete('/:id/items/:itemId', authorize(ROLES.WAITER), order.removeOrderItem);
router.patch('/:id/items/:itemId/status', authorize(ROLES.KITCHEN_STAFF, ROLES.OWNER, ROLES.WAITER), order.updateItemStatus);
router.patch('/:id/status', order.updateOrderStatus);
router.patch('/:id/customer-confirmation', authorize(ROLES.WAITER), order.reviewCustomerOrder);
export default router;
