import api from "./axios";

export const getTodayReport = async () => (await api.get("/reports/today")).data;
