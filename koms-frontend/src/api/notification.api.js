import api from "./axios";

export const listNotifications = async () => (await api.get("/notifications")).data;
export const markNotificationRead = async (id) => (await api.patch(`/notifications/${id}/read`)).data;
