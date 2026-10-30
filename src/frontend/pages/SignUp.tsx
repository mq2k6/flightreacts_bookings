import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
// Figroot export of "1. Log in / Sign up", with small fixes only:
// - renamed (names can't start with a number)
// - text boxes are now real inputs, wrapped in a form
// - "Create an account" is a link, "Log in" submits
// - content capped at 560px so it doesn't stretch or get cut off on phones
 export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");

  const matchingPass = password == confirm_password

  const navigate = useNavigate();
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TODO: replace with the real login call once the backend is ready
    console.log("Log in with", { email, password, confirm_password });
    navigate("/Login")

    //const res = await fetch("/createAccount", {
    //    method: "POST",
    //    headers: {
    //        "Content-Type": "application/json"
    //    },
    //    body: JSON.stringify({
    //        email: email,
    //       password: password
    //    })
    //});

    
  }

  return (

  <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-[#FFF] min-w-screen min-h-screen overflow-hidden">

    {/* Header */}
    <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full overflow-hidden">
      <p className="text-[#2E2E2E] font-inter text-xs font-bold w-fit">
        Flight Reservation System
      </p>

      <p className="text-[#737373] font-inter text-[10px] w-fit">
        Help
      </p>
    </div>

    {/* Login Form */}
    <form
      onSubmit={handleSubmit}
      className="flex py-4 px-5 flex-col items-start gap-2.5 w-full max-w-[600px] h-full overflow-hidden"
    >
      <p className="text-[#2E2E2E] font-inter text-lg font-bold w-fit">
        Sign Up
      </p>

      {/* Email */}
      <label className="flex flex-col items-start gap-1 w-full overflow-hidden">
        <p className="text-[#737373] font-inter text-[10px] w-fit">
          Email
        </p>

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
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
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
        />
      </label>

      {/* Password Confirm */}
      <label className="flex flex-col items-start gap-1 w-full overflow-hidden">
        <p className="text-[#737373] font-inter text-[10px] w-fit">
          Confirm Password
        </p>

        <input
          type="password"
          required
          value={confirm_password}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
        />
      </label>
        {/* Conditional message */}
            {confirm_password && (
                <p className="text-[#737373] font-inter text-[10px] w-fit">
                <p style={{ color: matchingPass ? 'green' : 'red' }}>
                {matchingPass ? 'Passwords match!' : 'Passwords do not match.'}
                </p> </p>
            )}


      {/* Sign Up Button */}
      <button
        type="submit"
        disabled={!matchingPass&& confirm_password!=""}
        className="cursor-pointer text-nowrap flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] w-fit overflow-hidden"
      >
        <p className="text-[#FFF] font-inter text-[11px] font-bold w-fit">
          Create Account
        </p>
      </button>

      {/* Login Link */}
      <a
        href="/login"
        className="text-[#804DD9] font-inter text-[11px] font-bold w-fit hover:underline"
      >
        <button
            type="button"
            onClick={() => navigate("/login")}
            className="hover:text-[#5C339E]"
            >
                Already Have an Account? Login

            </button>
      </a>

      {/* Additional Information */}
      <p className="text-[#737373] font-inter text-[10px] w-full max-w-[560px]">
        Travelers and staff use the same login. The account role decides what
        Home shows (staff get extra tools).
      </p>

    </form>
  </div>
    );
}
