import Order, { ORDER_STATUSES } from '../order/order.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';

export const getTodayReport = asyncHandler(async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const [summary] = await Order.aggregate([
    { $match: { createdAt: { $gte: startOfToday, $lt: startOfTomorrow } } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$totalAmount', 0] },
        },
        statuses: { $push: '$status' },
      },
    },
  ]);

  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  for (const status of summary?.statuses ?? []) ordersByStatus[status] += 1;

  res.status(200).json(new ApiResponse(200, {
    totalOrders: summary?.totalOrders ?? 0,
    totalRevenue: summary?.totalRevenue ?? 0,
    ordersByStatus,
  }, 'Today report fetched'));
});
