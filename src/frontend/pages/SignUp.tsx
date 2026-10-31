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
  const [name, setName] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const matchingPass = password == confirm_password
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();

  if (!matchingPass) {
    setError("Passwords do not match.");
    return;
  }

  setSubmitting(true);
  setError("");

  try {
    const response = await fetch("http://localhost:8000/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        full_name: name.trim(),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);

      // FastAPI sends a string for our own errors (e.g. "Email already registered")
      // and a list of objects for validation errors (e.g. password too short)
      if (typeof body?.detail === "string") {
        setError(body.detail);
      } else if (Array.isArray(body?.detail)) {
        const first = body.detail[0];
        const field = first?.loc?.[first.loc.length - 1];
        if (field === "password") {
          setError("Password must be 8 to 72 characters.");
        } else if (field === "email") {
          setError("Please enter a valid email address.");
        } else {
          setError("Please check your details and try again.");
        }
      } else {
        setError("Unable to create your account. Please try again.");
      }
      return;
    }

    navigate("/login");
  } catch (err) {
    console.error("Error signing up:", err);
    setError("Unable to reach the server. Please try again.");
  } finally {
    setSubmitting(false);
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
        Sign Up
      </p>
      {/* Name */}
      <label className="flex flex-col items-start gap-1 w-full overflow-hidden">
        <p className="text-[#737373] font-inter text-[10px] w-fit">
          Full Name
        </p>

        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          autoComplete="name"
          className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
        />
      </label>


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
          minLength={8} 
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
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
          minLength={8} 
          maxLength={72}
          value={confirm_password}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
        />
      </label>
        {/* Conditional message */}
          {confirm_password && (
        <p
          className="font-inter text-[10px] w-fit"
          style={{ color: matchingPass ? "green" : "red" }}
        >
          {matchingPass ? "Passwords match!" : "Passwords do not match."}
        </p>
      )}

      {error && (
        <p className="text-[#B3261E] font-inter text-[11px] w-full">{error}</p>
      )}
      {/* Sign Up Button */}
      <button
        type="submit"
        disabled={submitting || (!matchingPass && confirm_password !== "")}
        className="cursor-pointer text-nowrap flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] w-fit overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <p className="text-[#FFF] font-inter text-[11px] font-bold w-fit">
          {submitting ? "Creating..." : "Create Account"}
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
