import { io } from 'socket.io-client';

const baseUrl = process.env.KOMS_API_URL || 'http://localhost:4000/api';
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const password = 'E2eTestingPass123!';
const ownerUsername = process.env.KOMS_TEST_OWNER_USERNAME;
const ownerPassword = process.env.KOMS_TEST_OWNER_PASSWORD;
const created = { tableId: null, categoryId: null, menuItemIds: [], orderId: null, staffIds: [] };
const sockets = [];
const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl.replace('/api', ''), {
      auth: { token },
      transports: ['websocket'],
      timeout: 5000,
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function cleanup(ownerToken) {
  try {
    if (created.orderId) {
      const order = await request(`/orders/${created.orderId}`, { token: ownerToken });
      if (order.status === 200 && !['paid', 'cancelled'].includes(order.payload.data.status)) {
        const terminalStatus = order.payload.data.status === 'served' ? 'paid' : 'cancelled';
        await request(`/orders/${created.orderId}/status`, {
          method: 'PATCH', token: ownerToken, body: { status: terminalStatus },
        });
      }
    }
    for (const itemId of created.menuItemIds) {
      await request(`/menu/items/${itemId}`, { method: 'DELETE', token: ownerToken });
    }
    if (created.categoryId) await request(`/menu/categories/${created.categoryId}`, { method: 'DELETE', token: ownerToken });
    if (created.tableId) await request(`/tables/${created.tableId}`, { method: 'DELETE', token: ownerToken });
  } finally {
    await Promise.allSettled(created.staffIds.map((staffId) => request(
      `/auth/staff/${staffId}/deactivate`, { method: 'PATCH', token: ownerToken },
    )));
  }
}

let ownerToken;
try {
  assert(ownerUsername && ownerPassword, 'Set KOMS_TEST_OWNER_USERNAME and KOMS_TEST_OWNER_PASSWORD before running this script');
  const ownerLogin = await request('/auth/login', {
    method: 'POST', body: { emailOrUsername: ownerUsername, password: ownerPassword },
  });
  assert(ownerLogin.status === 200 && ownerLogin.payload.data.user.role === 'owner', 'Configured test credentials must belong to an active owner');
  ownerToken = ownerLogin.payload.data.token;
  const ownerId = ownerLogin.payload.data.user._id;
  record('Owner test account authenticated', true, '200');

  const createStaff = async (role, label) => {
    const username = `e2e_${label}_${suffix}`;
    const response = await request('/auth/create-staff', {
      method: 'POST', token: ownerToken,
      body: { username, email: `${username}@example.test`, password, role },
    });
    assert(response.status === 201, `create ${role} returned ${response.status}`);
    created.staffIds.push(response.payload.data._id);
    const login = await request('/auth/login', {
      method: 'POST', body: { emailOrUsername: username, password },
    });
    assert(login.status === 200, `${role} login returned ${login.status}`);
    return login.payload.data.token;
  };

  const waiterAToken = await createStaff('waiter', 'waiter_a');
  const waiterBToken = await createStaff('waiter', 'waiter_b');
  const kitchenToken = await createStaff('kitchen_staff', 'kitchen');
  const cashierToken = await createStaff('cashier', 'cashier');
  record('2a. Owner creates staff', true, '201');
  const waiterCreateStaff = await request('/auth/create-staff', {
    method: 'POST', token: waiterAToken,
    body: { username: `e2e_denied_${suffix}`, email: `e2e_denied_${suffix}@example.test`, password, role: 'waiter' },
  });
  record('2b. Waiter cannot create staff', waiterCreateStaff.status === 403, String(waiterCreateStaff.status));

  const lifecycleName = `e2e_lifecycle_${suffix}`;
  const lifecycleStaff = await request('/auth/create-staff', {
    method: 'POST', token: ownerToken,
    body: { username: lifecycleName, email: `${lifecycleName}@example.test`, password, role: 'waiter' },
  });
  assert(lifecycleStaff.status === 201, `lifecycle waiter creation returned ${lifecycleStaff.status}`);
  const lifecycleStaffId = lifecycleStaff.payload.data._id;
  created.staffIds.push(lifecycleStaffId);
  const lifecycleLogin = await request('/auth/login', {
    method: 'POST', body: { emailOrUsername: lifecycleName, password },
  });
  assert(lifecycleLogin.status === 200, `lifecycle waiter login returned ${lifecycleLogin.status}`);
  const lifecycleToken = lifecycleLogin.payload.data.token;
  const deactivated = await request(`/auth/staff/${lifecycleStaffId}/deactivate`, { method: 'PATCH', token: ownerToken });
  const inactiveRequest = await request('/auth/me', { token: lifecycleToken });
  record('2c. Owner deactivates staff and stale JWT is blocked', deactivated.status === 200 && inactiveRequest.status === 401, `${deactivated.status}/${inactiveRequest.status}`);
  const waiterDeactivate = await request(`/auth/staff/${lifecycleStaffId}/deactivate`, { method: 'PATCH', token: waiterBToken });
  record('2d. Waiter cannot deactivate staff', waiterDeactivate.status === 403, String(waiterDeactivate.status));
  const ownerDeactivate = await request(`/auth/staff/${ownerId}/deactivate`, { method: 'PATCH', token: ownerToken });
  record('2e. Owner cannot deactivate self', ownerDeactivate.status === 400, String(ownerDeactivate.status));
  const reactivated = await request(`/auth/staff/${lifecycleStaffId}/reactivate`, { method: 'PATCH', token: ownerToken });
  const activeRequest = await request('/auth/me', { token: lifecycleToken });
  record('2f. Owner reactivates staff and JWT works again', reactivated.status === 200 && activeRequest.status === 200, `${reactivated.status}/${activeRequest.status}`);

  const table = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-${suffix}`, capacity: 2 } });
  assert(table.status === 201, `table creation returned ${table.status}`);
  created.tableId = table.payload.data._id;
  const category = await request('/menu/categories', { method: 'POST', token: ownerToken, body: { name: `E2E-${suffix}`, displayOrder: 999 } });
  assert(category.status === 201, `category creation returned ${category.status}`);
  created.categoryId = category.payload.data._id;
  const item = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name: `E2E item ${suffix}`, price: 10, category: created.categoryId, prepTimeMinutes: 5 } });
  assert(item.status === 201, `menu item creation returned ${item.status}`);
  const menuItemId = item.payload.data._id;
  created.menuItemIds.push(menuItemId);
  record('3a. Owner creates table and menu', true, '201');

  const deniedTable = await request('/tables', { method: 'POST', token: waiterAToken, body: { name: `Denied-${suffix}`, capacity: 2 } });
  const deniedCategory = await request('/menu/categories', { method: 'POST', token: waiterAToken, body: { name: `Denied-${suffix}` } });
  const deniedItem = await request('/menu/items', { method: 'POST', token: waiterAToken, body: { name: `Denied-${suffix}`, price: 1, category: created.categoryId } });
  record('3b. Waiter management requests are denied', [deniedTable, deniedCategory, deniedItem].every((result) => result.status === 403), `${deniedTable.status}/${deniedCategory.status}/${deniedItem.status}`);

  const kitchen = await connect(kitchenToken);
  const waiterA = await connect(waiterAToken);
  const waiterB = await connect(waiterBToken);
  const cashier = await connect(cashierToken);
  const events = { kitchenNew: [], kitchenUpdated: [], cashierUpdated: [], waiterAReady: [], waiterAItem: [], waiterBReady: [], waiterBItem: [] };
  kitchen.on('order:new', (payload) => events.kitchenNew.push(payload));
  kitchen.on('order:updated', (payload) => events.kitchenUpdated.push(payload));
  cashier.on('order:updated', (payload) => events.cashierUpdated.push(payload));
  waiterA.on('order:ready', (payload) => events.waiterAReady.push(payload));
  waiterA.on('order:itemUpdated', (payload) => events.waiterAItem.push(payload));
  waiterB.on('order:ready', (payload) => events.waiterBReady.push(payload));
  waiterB.on('order:itemUpdated', (payload) => events.waiterBItem.push(payload));

  const orderResponse = await request('/orders', {
    method: 'POST', token: waiterAToken,
    body: { table: created.tableId, items: [{ menuItem: menuItemId, quantity: 1, notes: 'E2E' }] },
  });
  assert(orderResponse.status === 201, `order creation returned ${orderResponse.status}`);
  const order = orderResponse.payload.data;
  const orderId = order._id;
  created.orderId = orderId;
  const orderItemId = order.items[0]._id;
  await new Promise((resolve) => setTimeout(resolve, 250));
  record('4a. Waiter creates order and kitchen receives order:new', events.kitchenNew.some((event) => event._id === orderId), '201');

  const unavailableItem = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name: `E2E unavailable ${suffix}`, price: 10, category: created.categoryId, isAvailable: false } });
  assert(unavailableItem.status === 201, `unavailable item creation returned ${unavailableItem.status}`);
  created.menuItemIds.push(unavailableItem.payload.data._id);
  const unavailableOrder = await request('/orders', { method: 'POST', token: waiterAToken, body: { table: created.tableId, items: [{ menuItem: unavailableItem.payload.data._id, quantity: 1 }] } });
  record('4b. Unavailable item is rejected', unavailableOrder.status === 400, String(unavailableOrder.status));

  const preparing = await request(`/orders/${orderId}/items/${orderItemId}/status`, { method: 'PATCH', token: kitchenToken, body: { itemStatus: 'preparing' } });
  record('5a. Kitchen updates item status', preparing.status === 200, String(preparing.status));
  const waiterItemUpdate = await request(`/orders/${orderId}/items/${orderItemId}/status`, { method: 'PATCH', token: waiterAToken, body: { itemStatus: 'ready' } });
  record('5b. Waiter cannot update item status', waiterItemUpdate.status === 403, String(waiterItemUpdate.status));
  const skipped = await request(`/orders/${orderId}/status`, { method: 'PATCH', token: waiterAToken, body: { status: 'served' } });
  record('5c. Skipped overall status is rejected', skipped.status === 400, String(skipped.status));

  const ready = await request(`/orders/${orderId}/items/${orderItemId}/status`, { method: 'PATCH', token: kitchenToken, body: { itemStatus: 'ready' } });
  assert(ready.status === 200, `ready update returned ${ready.status}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const correctWaiterEvents = events.waiterAReady.some((event) => event._id === orderId) && events.waiterAItem.some((event) => event.orderId === orderId);
  const noCrossWaiterEvents = events.waiterBReady.length === 0 && events.waiterBItem.length === 0;
  record('6. Socket delivery is kitchen/own-waiter only', correctWaiterEvents && noCrossWaiterEvents && events.kitchenUpdated.length >= 2, `A ready=${events.waiterAReady.length}, A item=${events.waiterAItem.length}, B ready=${events.waiterBReady.length}, B item=${events.waiterBItem.length}`);

  const served = await request(`/orders/${orderId}/status`, { method: 'PATCH', token: waiterAToken, body: { status: 'served' } });
  assert(served.status === 200, `served returned ${served.status}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  record('6b. Cashier receives served order update', events.cashierUpdated.some((event) => event._id === orderId && event.status === 'served'), `served events=${events.cashierUpdated.filter((event) => event.status === 'served').length}`);
  const paid = await request(`/orders/${orderId}/status`, { method: 'PATCH', token: cashierToken, body: { status: 'paid' } });
  assert(paid.status === 200, `paid returned ${paid.status}`);
  const releasedTable = await request(`/tables/${created.tableId}`, { token: ownerToken });
  record('6c. Payment releases the table', releasedTable.status === 200 && releasedTable.payload.data.status === 'free', `${releasedTable.status}/${releasedTable.payload.data?.status}`);

  const ownerReport = await request('/reports/today', { token: ownerToken });
  const expectedStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
  const validReport = ownerReport.status === 200 && expectedStatuses.every((status) => Object.hasOwn(ownerReport.payload.data.ordersByStatus, status));
  record('7a. Owner receives daily report', validReport, String(ownerReport.status));
  const waiterReport = await request('/reports/today', { token: waiterAToken });
  record('7b. Waiter is denied daily report', waiterReport.status === 403, String(waiterReport.status));
} catch (error) {
  record('Harness execution', false, error.message);
} finally {
  for (const socket of sockets) socket.disconnect();
  if (ownerToken) await cleanup(ownerToken);
}

if (results.some((result) => !result.passed)) process.exitCode = 1;
