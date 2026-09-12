const configuredApiOrigin = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_ORIGIN =
  configuredApiOrigin ||
  (import.meta.env.PROD ? "https://sportsanalytics-api.onrender.com" : "http://localhost:4000");

export const API_BASE_URL = configuredApiOrigin || (import.meta.env.PROD ? API_ORIGIN : "/api");
