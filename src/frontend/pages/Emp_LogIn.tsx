import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

export default function Emp_LogIn() {
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [invalidLogin, setInvalidLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setInvalidLogin(false);

    try {
      const response = await fetch("http://localhost:8000/employee_login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          empId: `EMP${empId}`,
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // Save authentication token
      localStorage.setItem("token", data.token);
      
      // Save passenger information
      localStorage.setItem(
        "passenger",
        JSON.stringify(data.passenger)
      );
      localStorage.setItem(
        "employee",
        JSON.stringify(data.employee)
      );
      navigate("/home");

    } catch (error) {
      console.error("Login error:", error);
      setInvalidLogin(true);

    } finally {
      setLoading(false);
    }
  }

  return (
<div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-[#FFF] min-w-screen min-h-screen overflow-hidden">
      {/* Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full overflow-hidden">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold w-fit">
          Flight Reservation System
        </p>
      </div>

      {/* Login Form */}
      <form
        onSubmit={handleSubmit}
        className="flex py-4 px-5 flex-col items-start gap-2.5 w-full max-w-[600px] mx-auto overflow-hidden"
      >
        <p className="text-[#2E2E2E] font-inter text-lg font-bold w-fit">
          Log in
        </p>

        {/* Email */}
        <label className="flex flex-col items-start gap-1 w-full overflow-hidden">
          <p className="text-[#737373] font-inter text-[10px] w-fit">
            Employee Id
          </p>
          <input
         
            type="empId"
            required
            value={`EMP${empId}`}
            onChange={(e) => {
              setEmpId(e.target.value.substring(3));
              setInvalidLogin(false);
            }}
            placeholder="EMP0000"
            className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
          />
        </label>

        {/* Password */}
        <label className="flex flex-col items-start gap-1 w-full overflow-hidden">
          <p className="text-[#737373] font-inter text-[10px] w-fit">
            Password
          </p>

          <input
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setInvalidLogin(false);
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
          />
        </label>

        {/* Conditional Error Message */}
        {invalidLogin && (
          <p className="text-red-500 font-inter text-[10px] w-fit">
            Incorrect Id or password
          </p>
        )}

        {/* Login Button */}
        <button
          type="submit"
          disabled={loading}
          className="cursor-pointer text-nowrap flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] w-fit overflow-hidden disabled:opacity-50"
        >
          <p className="text-[#FFF] font-inter text-[11px] font-bold w-fit">
            {loading ? "Logging in..." : "Log in"}
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="text-[#804DD9] font-inter text-[11px] font-bold w-fit hover:text-[#5C339E] hover:underline"
        >
          Not an Employee? Log In as a passenger
        </button>

      </form>
    </div>
  );
}