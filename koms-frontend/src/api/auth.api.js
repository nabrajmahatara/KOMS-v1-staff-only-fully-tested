import api from "./axios";

export const createStaff = async (userData) => {
  const response = await api.post("/auth/create-staff", userData);
  return response.data;
};

export const listStaff = async () => (await api.get("/auth/staff")).data;
export const deactivateStaff = async (id) =>
  (await api.patch(`/auth/staff/${id}/deactivate`)).data;
export const reactivateStaff = async (id) =>
  (await api.patch(`/auth/staff/${id}/reactivate`)).data;

export const loginUser = async (credentials) => {
  const response = await api.post("/auth/login", credentials);
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};
