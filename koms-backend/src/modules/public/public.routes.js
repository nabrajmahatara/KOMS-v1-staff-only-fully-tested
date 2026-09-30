import { Router } from 'express';
import { getPublicMenu, getPublicTable, publicOrderLimiter, submitPublicOrder } from './public.controller.js';

const router = Router();

router.get('/menu', getPublicMenu);
router.get('/table/:token', getPublicTable);
router.post('/table/:token/order', publicOrderLimiter, submitPublicOrder);

export default router;
