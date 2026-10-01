import { Router } from 'express';
import { getOccupiedPublicTables, getPublicMenu, getPublicTable, publicOrderLimiter, publicTableOrderLimiter, submitPublicOrder, submitPublicTableOrder } from './public.controller.js';

const router = Router();

router.get('/menu', getPublicMenu);
router.get('/tables/occupied', getOccupiedPublicTables);
router.get('/table/:token', getPublicTable);
router.post('/table/:token/order', publicOrderLimiter, submitPublicOrder);
router.post('/tables/:tableId/order', publicTableOrderLimiter, submitPublicTableOrder);

export default router;
