
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getUserId } from "../utils/auth";

interface Passenger {
  booking_id: number;
  booking_ref: string;
  traveler_name: string;
  seat_no: string;
  tier: string;
  booked_by?: {
    passenger_id: number;
    name: string;
    email: string;
  };
}

interface Flight {
  id: number;
  flight_no: string;
  status: string;
  from_code: string;
  to_code: string;
  depart_at: string;
  arrive_at: string;
}

interface PassengerManifest {
  flight: Flight;
  passenger_count: number;
  passengers: Passenger[];
}

const PAGE_SIZE = 6;
const API_URL = "http://localhost:8000";

export default function Passenger_List() {
  const navigate = useNavigate();

  const { id } = useParams();
  const userId = getUserId();
  const [manifest, setManifest] = useState<PassengerManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchPassengers = async () => {
      try {
        setLoading(true);
        setError("");

        const token = localStorage.getItem("token");

        if (!token) {
          navigate("/login");
          return;
        }

        const response = await fetch(
          `${API_URL}/flights/${id}/passengers`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(
            data?.detail || "Unable to load the passenger list."
          );
        }

        const data: PassengerManifest = await response.json();
        setManifest(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchPassengers();
    } else {
      setError("No flight ID was provided.");
      setLoading(false);
    }
  }, [id, navigate]);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-CA", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const totalPages = manifest
    ? Math.max(1, Math.ceil(manifest.passengers.length / PAGE_SIZE))
    : 1;

  const startIndex = (page - 1) * PAGE_SIZE;

  const visiblePassengers = manifest
    ? manifest.passengers.slice(startIndex, startIndex + PAGE_SIZE)
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-8 text-gray-500">
        Loading passengers...
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className="min-h-screen bg-white p-8">
        <p className="text-red-600">
          {error || "Passenger information could not be loaded."}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 rounded-lg border border-purple-300 px-5 py-2 font-semibold hover:bg-purple-50"
        >
          Go back
        </button>
      </div>
    );
    
  }
    function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    localStorage.removeItem("employee")
    navigate("/login");
  }


  
  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white min-h-screen w-full overflow-hidden">

      {/* Navigation Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">
          Flight Reservation System
        </p>

        <nav className="flex gap-3 text-[#737373] font-inter text-[10px]">
          <Link to="/home" className="hover:text-[#5C339E]">
            Home
          </Link>

          <Link
            to={`/account/${userId}`}
            className="hover:text-[#5C339E]"
          >
            My Account
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="hover:text-[#5C339E]"
          >
            Log out
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex py-4 px-5 flex-col items-start gap-2.5 w-full">

        {/* Page Heading */}
        <div className="flex justify-between items-center w-full gap-3">
          <h1 className="text-[#2E2E2E] font-inter text-lg font-bold">
            Passengers · {manifest.flight.flight_no}
          </h1>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D]"
          >
            New Search
          </button>
        </div>

        {/* Flight Information */}
        <p className="text-[#737373] font-inter text-[11px]">
          {manifest.flight.from_code} → {manifest.flight.to_code}
          {" · "}
          {formatDate(manifest.flight.depart_at)}
          {" · "}
          {formatTime(manifest.flight.depart_at)}
          {" · "}
          {manifest.passenger_count} passengers
        </p>

        {/* Passenger Table */}
        <div className="w-full overflow-x-auto rounded-md border border-[#D1C7EB]">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="bg-[#F2EDFC] text-[#2E2E2E] font-inter text-xs font-bold">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Seat</th>
                <th className="py-2.5 px-3">Tier</th>
                <th className="py-2.5 px-3">Booking ref</th>
              </tr>
            </thead>

            <tbody>
              {visiblePassengers.map((passenger) => (
                <tr
                  key={passenger.booking_id}
                  className="border-t border-[#EEEEEE] text-[#444444] font-inter text-[11px]"
                >
                  <td className="py-2.5 px-3">
                    {passenger.traveler_name}
                  </td>

                  <td className="py-2.5 px-3">
                    {passenger.seat_no}
                  </td>

                  <td className="py-2.5 px-3">
                    {passenger.tier.charAt(0).toUpperCase() +
                      passenger.tier.slice(1).toLowerCase()}
                  </td>

                  <td className="py-2.5 px-3">
                    {passenger.booking_ref}
                  </td>
                </tr>
              ))}

              {visiblePassengers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 px-3 text-center text-[#737373] font-inter text-[11px]"
                  >
                    No passengers found for this flight.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <p className="text-[#737373] font-inter text-[10px]">
            Showing {manifest.passengers.length === 0 ? 0 : startIndex + 1}
            {"–"}
            {Math.min(startIndex + PAGE_SIZE, manifest.passengers.length)}
            {" of "}
            {manifest.passengers.length} passengers
            {" · "}Page {page}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => current - 1)}
                disabled={page === 1}
                className="cursor-pointer rounded border border-[#D1C7EB] bg-white px-3 py-1.5 text-[#2E2E2E] font-inter text-[10px] font-bold hover:bg-[#F2EDFC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="text-[#737373] font-inter text-[10px]">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page === totalPages}
                className="cursor-pointer rounded border border-[#D1C7EB] bg-white px-3 py-1.5 text-[#2E2E2E] font-inter text-[10px] font-bold hover:bg-[#F2EDFC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );

}
