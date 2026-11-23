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

// AUTH-3: true only for employees whose staff.employee_type is 'admin'.
// (Different from getAdmin() below, which is the "Admin Mode" UI toggle any staff can use.)
export function isAdminEmployee(): boolean {
  try {
    const employee = JSON.parse(localStorage.getItem("employee") ?? "null");
    return employee?.employee_type === "admin";
  } catch {
    return false;
  }
}

export function getAdmin(): boolean {
  return localStorage.getItem("admin") === "true";
}