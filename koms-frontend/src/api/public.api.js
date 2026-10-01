import api from "./axios";

export const getPublicTable = async (token) => (await api.get(`/public/table/${token}`)).data;
export const getPublicMenu = async () => (await api.get("/public/menu")).data;
export const submitPublicOrder = async (token, body) => (await api.post(`/public/table/${token}/order`, body)).data;
export const getOccupiedPublicTables = async () => (await api.get("/public/tables/occupied")).data;
export const submitPublicTableOrder = async (tableId, body) => (await api.post(`/public/tables/${tableId}/order`, body)).data;
