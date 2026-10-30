
import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function LogIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invalidLogin, setInvalidLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setInvalidLogin(false);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setInvalidLogin(true);
      return;
    }

    navigate("/home");
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
          Log in
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
            onChange={(e) => {
              setEmail(e.target.value);
              setInvalidLogin(false);
            }}
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
            Incorrect email or password
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

    {/* Sign Up Link */}
 
      <a
        href="/signup"
        className="text-[#804DD9] font-inter text-[11px] font-bold w-fit hover:underline"
      >
        <button
            type="button"
            onClick={() => navigate("/signup")}
            className="hover:text-[#5C339E]"
            >
                New here? Create an account

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
