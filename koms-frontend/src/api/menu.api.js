import api from "./axios";

export const listCategories = async () => (await api.get("/menu/categories")).data;
export const createCategory = async (category) =>
  (await api.post("/menu/categories", category)).data;
export const listMenuItems = async () => (await api.get("/menu/items")).data;
export const createMenuItem = async (item) => (await api.post("/menu/items", item)).data;
export const toggleMenuItemAvailability = async (id, isAvailable) =>
  (await api.patch(`/menu/items/${id}/availability`, { isAvailable })).data;
