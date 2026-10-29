import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./pages/Homepage";
import LogInSignUp from "./pages/LogInSignUp";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LogInSignUp />} />
        <Route path="/home" element={<HomePage />} />

        {/* Redirect unknown URLs to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
