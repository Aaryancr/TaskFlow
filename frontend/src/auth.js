const TOKEN_KEY = "taskflow_token";

function getStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function getToken() {
  return getStorage()?.getItem(TOKEN_KEY) || null;
}

export function saveToken(token) {
  getStorage()?.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  getStorage()?.removeItem(TOKEN_KEY);
}

export function hasToken() {
  return Boolean(getToken());
}
