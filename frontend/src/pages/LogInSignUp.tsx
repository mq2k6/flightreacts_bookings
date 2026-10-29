import { useState, type FormEvent } from "react";

// Figroot export of "1. Log in / Sign up", with small fixes only:
// - renamed (names can't start with a number)
// - text boxes are now real inputs, wrapped in a form
// - "Create an account" is a link, "Log in" submits
// - content capped at 560px so it doesn't stretch or get cut off on phones
export default function LogInSignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TODO: replace with the real login call once the backend is ready
    console.log("Log in with", { email, password });
  }

  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-[#FFF] min-w-screen min-h-screen overflow-hidden"><div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full overflow-hidden"><p className="text-[#2E2E2E] font-inter text-xs font-bold w-fit">Flight Reservation System</p><p className="text-[#737373] font-inter text-[10px] w-fit">Help</p></div><form onSubmit={handleSubmit} className="flex py-4 px-5 flex-col items-start gap-2.5 w-full max-w-[600px] h-full overflow-hidden"><p className="text-[#2E2E2E] font-inter text-lg font-bold w-fit">Log in</p><label className="flex flex-col items-start gap-1 w-full overflow-hidden"><p className="text-[#737373] font-inter text-[10px] w-fit">Email</p><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]" /></label><label className="flex flex-col items-start gap-1 w-full overflow-hidden"><p className="text-[#737373] font-inter text-[10px] w-fit">Password</p><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className="flex py-[7px] px-2 items-start rounded border border-[#D1C7EB] bg-[#FFF] w-full overflow-hidden text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]" /></label><button type="submit" className="cursor-pointer text-nowrap flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] w-fit overflow-hidden"><p className="text-[#FFF] font-inter text-[11px] font-bold w-fit">Log in</p></button><a href="/signup" className="text-[#804DD9] font-inter text-[11px] font-bold w-fit hover:underline">New here? Create an account</a><p className="text-[#737373] font-inter text-[10px] w-full max-w-[560px]">Travelers and staff use the same login. The account role decides what Home shows &#40;staff get extra tools&#41;.</p></form></div>
  );
}
