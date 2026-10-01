import Table from './table.model.js';

// A conditional update is the source of truth for claiming a table. It avoids
// the read-then-write race where two requests could both see a free table.
export async function claimFreeTable(tableId) {
  return Table.findOneAndUpdate(
    { _id: tableId, status: 'free' },
    { $set: { status: 'occupied' } },
    { new: true }
  );
}
