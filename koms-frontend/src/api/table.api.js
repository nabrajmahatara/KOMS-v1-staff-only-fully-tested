import api from "./axios";

export const listTables = async () => (await api.get("/tables")).data;
export const createTable = async (table) => (await api.post("/tables", table)).data;
export const updateTableStatus = async (id, status) =>
  (await api.patch(`/tables/${id}/status`, { status })).data;
