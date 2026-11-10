import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./pages/Homepage";
import LogIn from "./pages/LogIn";
import Emp_LogIn from "./pages/Emp_LogIn";

import SignUp from "./pages/SignUp";
import Account from "./pages/Account"
import Flight_Details from "./pages/Flight_Details"
import Confirm_Booking from "./pages/Confirm_Booking"
import { useState } from "react";

export default function App() {
  const [user, setUser]= useState(null)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LogIn />} />
        <Route path="/emp-login" element={<Emp_LogIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/account/:id" element={<Account />} />
        <Route path="/flight-details/:id" element={<Flight_Details />} />
        <Route path="/booking-site/:id" element={<Confirm_Booking />} />
        {/* Redirect unknown URLs to login */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
