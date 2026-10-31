export function getUserId(): number | null {
  try {
    const passenger = JSON.parse(localStorage.getItem("passenger") ?? "null");
    return passenger?.id ?? null;
  } catch {
    return null;
  }
}