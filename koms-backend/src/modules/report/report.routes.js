import { Router } from 'express';
import { authorize, protect } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';
import { getTodayReport } from './report.controller.js';

const router = Router();
router.get('/today', protect, authorize(ROLES.OWNER, ROLES.MANAGER), getTodayReport);

export default router;
