import api from "./axios";

export const createOrder = async (order) => (await api.post("/orders", order)).data;
export const listOrders = async (filters = {}) => {
  const params = new URLSearchParams(filters);
  return (await api.get(`/orders${params.toString() ? `?${params}` : ""}`)).data;
};
export const getOrder = async (id) => (await api.get(`/orders/${id}`)).data;
export const addOrderItem = async (id, item) =>
  (await api.post(`/orders/${id}/items`, item)).data;
export const removeOrderItem = async (orderId, itemId) =>
  (await api.delete(`/orders/${orderId}/items/${itemId}`)).data;
export const updateOrderStatus = async (id, status) =>
  (await api.patch(`/orders/${id}/status`, { status })).data;
export const updateOrderItemStatus = async (orderId, itemId, itemStatus) =>
  (await api.patch(`/orders/${orderId}/items/${itemId}/status`, { itemStatus })).data;
export const listAwaitingConfirmationOrders = async () =>
  (await api.get("/orders/awaiting-confirmation")).data;
export const reviewCustomerOrder = async (id, action, rejectionReason = "") =>
  (await api.patch(`/orders/${id}/customer-confirmation`, { action, rejectionReason })).data;
