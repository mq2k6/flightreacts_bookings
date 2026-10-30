import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./pages/Homepage";
import LogIn from "./pages/LogIn";
import SignUp from "./pages/SignUp";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LogIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<HomePage />} />

        {/* Redirect unknown URLs to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
