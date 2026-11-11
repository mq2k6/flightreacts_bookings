export function getUserId(): number | null {
  try {
    const passenger = JSON.parse(localStorage.getItem("passenger") ?? "null");
    return passenger?.id ?? null;
  } catch {
    return null;
  }
}

export function getEmployeeId(): number | null {
  try {
    const employee = JSON.parse(localStorage.getItem("employee") ?? "null");
    return employee?.id ?? null;
  } catch {
    return null;
  }
}

export function getAdmin(): boolean {
  return localStorage.getItem("admin") === "true";
}