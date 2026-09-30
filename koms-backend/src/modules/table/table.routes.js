import { Router } from 'express';
import { authorize, protect } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';
import { createTable, deleteTable, getTable, getTables, regeneratePublicToken, updateTable, updateTableStatus } from './table.controller.js';

const router = Router();
router.use(protect);
router.get('/', getTables);
router.get('/:id', getTable);
router.post('/', authorize(ROLES.OWNER, ROLES.MANAGER), createTable);
router.patch('/:id', authorize(ROLES.OWNER, ROLES.MANAGER), updateTable);
router.patch('/:id/status', authorize(ROLES.OWNER, ROLES.MANAGER), updateTableStatus);
router.patch('/:id/regenerate-token', authorize(ROLES.OWNER, ROLES.MANAGER), regeneratePublicToken);
router.delete('/:id', authorize(ROLES.OWNER, ROLES.MANAGER), deleteTable);

export default router;
