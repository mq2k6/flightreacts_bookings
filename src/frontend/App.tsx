import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./pages/Homepage";
import LogIn from "./pages/LogIn";
import SignUp from "./pages/SignUp";
import { useState } from "react";

export default function App() {
  const [user, setUser]= useState(null)
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
