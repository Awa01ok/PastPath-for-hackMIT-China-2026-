window.API_BASE = 'http://127.0.0.1:8000';

async function apiGet(path) {
  const response = await fetch(`${window.API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}