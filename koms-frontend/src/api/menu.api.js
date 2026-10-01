import api from "./axios";

export const uploadMenuImage = async (file) => {
  const formData = new FormData();
  formData.append("image", file);
  return (await api.post("/menu/uploads/menu-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })).data;
};

export const listCategories = async () => (await api.get("/menu/categories")).data;
export const createCategory = async (category) =>
  (await api.post("/menu/categories", category)).data;
export const updateCategory = async (id, category) =>
  (await api.patch(`/menu/categories/${id}`, category)).data;
export const listMenuItems = async () => (await api.get("/menu/items")).data;
export const createMenuItem = async (item) => (await api.post("/menu/items", item)).data;
export const updateMenuItem = async (id, item) =>
  (await api.patch(`/menu/items/${id}`, item)).data;
export const toggleMenuItemAvailability = async (id, isAvailable) =>
  (await api.patch(`/menu/items/${id}/availability`, { isAvailable })).data;
