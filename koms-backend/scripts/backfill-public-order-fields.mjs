import dotenv from 'dotenv';
import dns from 'dns';
import mongoose from 'mongoose';
import Table from '../src/modules/table/table.model.js';
import Order from '../src/modules/order/order.model.js';
import { generatePublicToken } from '../src/utils/publicToken.js';

dotenv.config();

const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);
dns.setServers(dnsServers);

if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI is required');
}

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

try {
  await Promise.all([Table.createIndexes(), Order.createIndexes()]);
  const orderResult = await Order.updateMany(
    { $or: [{ source: { $exists: false } }, { source: null }, { source: '' }] },
    { $set: { source: 'staff' } }
  );

  let tableTokensAdded = 0;
  const tablesWithoutToken = Table.find({
    $or: [{ publicToken: { $exists: false } }, { publicToken: null }, { publicToken: '' }],
  }).select('_id');

  for await (const table of tablesWithoutToken.cursor()) {
    let updated = false;
    while (!updated) {
      try {
        const result = await Table.updateOne(
          { _id: table._id, $or: [{ publicToken: { $exists: false } }, { publicToken: null }, { publicToken: '' }] },
          { $set: { publicToken: generatePublicToken() } }
        );
        updated = result.modifiedCount === 1;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    tableTokensAdded += 1;
  }

  const [totalTables, totalOrders, tablesMissingToken, ordersMissingSource] = await Promise.all([
    Table.countDocuments(),
    Order.countDocuments(),
    Table.countDocuments({ $or: [{ publicToken: { $exists: false } }, { publicToken: null }, { publicToken: '' }] }),
    Order.countDocuments({ $or: [{ source: { $exists: false } }, { source: null }, { source: '' }] }),
  ]);

  if (tablesMissingToken || ordersMissingSource) {
    throw new Error(`Backfill incomplete: tables missing token=${tablesMissingToken}, orders missing source=${ordersMissingSource}`);
  }

  console.log(`Orders backfilled with source=staff: ${orderResult.modifiedCount}`);
  console.log(`Table public tokens generated: ${tableTokensAdded}`);
  console.log(`Verified tables with publicToken: ${totalTables - tablesMissingToken}/${totalTables}`);
  console.log(`Verified orders with source: ${totalOrders - ordersMissingSource}/${totalOrders}`);
  console.log('Backfill completed successfully.');
} finally {
  await mongoose.disconnect();
}
