import { clearToken, getToken } from "./auth.js";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function getErrorMessage(data, status) {
  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data && typeof data.detail === "string") {
    return data.detail;
  }

  return `Request failed (${status})`;
}

export async function apiRequest(path, options = {}) {
  const {
    authenticated = false,
    body,
    headers,
    onUnauthorized,
    token: providedToken,
    ...requestOptions
  } = options;
  const token = providedToken ?? (authenticated ? getToken() : null);
  const requestHeaders = new Headers(headers);
  const isFormData = body instanceof FormData;

  if (body !== undefined && body !== null && !isFormData) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      headers: requestHeaders,
      body: body !== undefined && !isFormData ? JSON.stringify(body) : body,
    });
  } catch {
    throw new ApiError("Unable to reach the TaskFlow API. Please try again.", 0, null);
  }

  const rawBody = await response.text();
  let data = null;

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = rawBody;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearToken();
      onUnauthorized?.();
    }

    throw new ApiError(getErrorMessage(data, response.status), response.status, data);
  }

  return data;
}
