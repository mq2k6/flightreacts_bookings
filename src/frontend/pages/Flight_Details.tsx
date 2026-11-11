import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUserId, getEmployeeId } from "../utils/auth";

type Tier = "premium" | "standard" | "economy";

interface Seat {
  id: number;
  seat_no: string;
  tier: Tier;
  fare_cents: number;
  taken: boolean;
}

interface FlightDetails {
  id: number;
  flight_no: string;
  status: string;
  from: string;
  from_code: string;
  from_timezone: string;
  to: string;
  to_code: string;
  to_timezone: string;
  depart_at: string;
  arrive_at: string;
  fares_cents: Record<Tier, number>;
  seats: Seat[];
  my_bookings: MyBooking[];
}

interface MyBooking {
  booking_id: number;
  booking_ref: string;
  traveler_name: string;
  seat_no: string;
  tier: Tier;
  total_cents: number;
  checked_bags: number;
  checked_in: boolean;
}

const TIERS: { key: Tier; label: string; location: string }[] = [
  { key: "premium", label: "Premium", location: "Front" },
  { key: "standard", label: "Standard", location: "Middle" },
  { key: "economy", label: "Economy", location: "Back" },
];

const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Sort seat numbers like 1A, 1B, ... 2A, ... 12F
function compareSeats(a: string, b: string) {
  const rowA = parseInt(a, 10);
  const rowB = parseInt(b, 10);
  return rowA !== rowB ? rowA - rowB : a.localeCompare(b);
}

function formatDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  });
}

function formatTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}


export default function Flight_Details() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = getUserId();
  const employeeId= getEmployeeId();
  const [flight, setFlight] = useState<FlightDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSeatIds, setSelectedSeatIds] = useState<number[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);

useEffect(() => {
  

  async function loadFlight() {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    if (!id) {
      setError("Invalid flight ID.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/flights/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("passenger");
        navigate("/login");
        return;
      }

      if (response.status === 404) {
        setError("Flight not found.");
        return;
      }

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const data = await response.json();

      const formattedFlight: FlightDetails = {
        ...data,
        from_tz: data.from_timezone,
        to_tz: data.to_timezone,
        seats: data.seats.map((seat: any) => ({
          id: seat.id,
          seat_no: seat.seat_no,
          tier: seat.tier,
          taken: !seat.available,
          fare_cents: data.fares_cents[seat.tier],
        })),
      };

      setFlight(formattedFlight);

    } catch (err) {
      console.error("Error loading flight:", err);
      setError("Unable to load this flight. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  loadFlight();
}, [id, navigate]);

  const openSeats = useMemo(
    () =>
      (flight?.seats ?? [])
        .filter((s) => !s.taken)
        .sort((a, b) => compareSeats(a.seat_no, b.seat_no)),
    [flight]
  );

  const selectedSeats = openSeats.filter((s) =>
    selectedSeatIds.includes(s.id)
  );
  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    localStorage.removeItem("employee")
    navigate("/login");
  }
  function handleSeatToggle(seatId: number) {
  setSelectedSeatIds((prev) =>
    prev.includes(seatId)
      ? prev.filter((id) => id !== seatId)
      : [...prev, seatId]
  );
}
  function handleContinue() {
  if (selectedSeats.length === 0) return;

  const seatNumbers = selectedSeats.map((seat) => seat.seat_no).join(",");

  navigate(`/booking-site/${id}?seats=${encodeURIComponent(seatNumbers)}`);
}

  function tierStats(tier: Tier) {
    const seats = flight!.seats.filter((s) => s.tier === tier);
    const rows = seats.map((s) => parseInt(s.seat_no, 10)).filter((n) => !isNaN(n));
    return {
      total: seats.length,
      open: seats.filter((s) => !s.taken).length,
      rows: rows.length ? [Math.min(...rows), Math.max(...rows)] : null,
    };
  }


  function handleCancelClick() {
  setCancelPassword("");
  setCancelError("");
  setShowCancelModal(true);
}

async function handleConfirmCancellation(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const token = localStorage.getItem("token");

  if (!token || !flight) {
    navigate("/login");
    return;
  }

  setCancelling(true);
  setCancelError("");

  try {
    const response = await fetch(
      `http://localhost:8000/employees/flights/${flight.id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: cancelPassword,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      setCancelError(data.detail || "Incorrect password or cancellation failed.");
      return;
    }

    setShowCancelModal(false);
    navigate("/home");

  } catch (error) {
    console.error("Error cancelling flight:", error);
    setCancelError("Unable to cancel flight. Please try again.");
  } finally {
    setCancelling(false);
  }
}

  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white min-h-screen w-full overflow-hidden">
      {/* Navigation Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">
          Flight Reservation System
        </p>
        <nav className="flex gap-3 text-[#737373] font-inter text-[10px]">
          <Link to="/home" className="hover:text-[#5C339E]">Home</Link>
          <Link to={`/account/${userId}`} className="hover:text-[#5C339E]">
            My Account
          </Link>
          <button type="button" onClick={handleLogout} className="hover:text-[#5C339E]">
            Log out
          </button>
        </nav>
      </div>

      {/* Main Content */}
<div className="flex py-4 px-5 flex-col items-start gap-3 w-full max-w-[1400px] mx-auto">        {loading ? (
          <p className="text-[#737373] font-inter text-[11px]">Loading flight...</p>
        ) : error || !flight ? (
          <>
            <p className="text-[#737373] font-inter text-[11px]">
              {error || "Flight not found."}
            </p>
            <Link to="/home" className="text-[#804DD9] font-inter text-[11px] font-bold hover:underline">
              ← Back to home
            </Link>
          </>
        ) : (
          <>
            {/* Title + status */}
            <div className="flex items-center justify-between gap-3 w-full">
              <h1 className="text-[#2E2E2E] font-inter text-lg font-bold">
                Flight {flight.flight_no}
              </h1>
              <span className="rounded-xl border border-[#D1C7EB] bg-white px-3 py-1 text-[#2E2E2E] font-inter text-[10px]">
                {capitalize(flight.status)}
              </span>
            </div>

            {/* Route summary */}
            <p className="text-[#2E2E2E] font-inter text-[11px]">
              {flight.from} ({flight.from_code}) → {flight.to} ({flight.to_code})
              {" · "}
              {formatDate(flight.depart_at, flight.from_timezone)}
              {" · "}
              Departs {formatTime(flight.depart_at, flight.from_timezone)}
              {" · "}
              Arrives {formatTime(flight.arrive_at, flight.to_timezone)}
            </p>
            {/* Two-column layout: info on the left, seat picker on the right */}
            <div className="flex flex-col md:flex-row items-start gap-5 w-full">

              {/* LEFT: current seats + fares */}
              <div className="flex flex-col items-start gap-3 flex-1 min-w-0 w-full">

                

                {/* Seats & fares by tier */}
                <h2 className="text-[#2E2E2E] font-inter text-xs font-bold">
                  Seats &amp; fares by tier
                </h2>

                <div className="w-full overflow-hidden rounded-lg border border-[#D1C7EB]">
                  <table className="w-full text-left font-inter text-[11px] text-[#2E2E2E]">
                    <thead className="bg-[#F2EDFC]">
                      <tr>
                        <th className="px-3 py-2 font-bold">Tier</th>
                        <th className="px-3 py-2 font-bold">Location</th>
                        <th className="px-3 py-2 font-bold">Fare</th>
                        <th className="px-3 py-2 font-bold">Seats open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TIERS.map(({ key, label, location }) => {
                        const stats = tierStats(key);
                        return (
                          <tr key={key}>
                            <td className="px-3 py-2">{label}</td>
                            <td className="px-3 py-2">
                              {location}
                              {stats.rows && ` · rows ${stats.rows[0]}–${stats.rows[1]}`}
                            </td>
                            <td className="px-3 py-2">{dollars(flight.fares_cents[key])}</td>
                            <td className="px-3 py-2">
                              {stats.open} / {stats.total}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                </div>
{/* Current Bookings */}
                {flight.my_bookings && flight.my_bookings.length > 0 && (
                  <div className="flex flex-col items-start gap-2 w-full rounded-lg border border-[#D1C7EB] bg-[#F2EDFC] p-3">
                    <h2 className="text-[#2E2E2E] font-inter text-xs font-bold">
                      Your current seats are:
                    </h2>

                    <div className="flex flex-col gap-2 w-full">
                      {flight.my_bookings.map((booking) => (
                        <div
                          key={booking.booking_id}
                          className="flex flex-wrap justify-between items-center gap-2 rounded-md border border-[#D1C7EB] bg-white p-2.5"
                        >
                          <div className="flex flex-col gap-1">
                          <p className="text-[#2E2E2E] font-inter text-[11px] font-bold">
                            {booking.traveler_name}
                          </p>
                          <p className="text-[#737373] font-inter text-[10px]">
                            Seat {booking.seat_no} · {capitalize(booking.tier)} · Ref {booking.booking_ref}
                          </p>
                        </div>

                          <p className="text-[#2E2E2E] font-inter text-[11px] font-bold">
                            {dollars(booking.total_cents)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[#2E2E2E] font-inter text-[11px] font-bold">
                  {openSeats.length} of {flight.seats.length} seats available
                </p>

                <p className="text-[#737373] font-inter text-[10px]">
                  Price depends on where the seat is in the plane. Choose an open seat
                  from the list.
                </p>

                 {employeeId !== null && (
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    className="cursor-pointer flex w-full py-[7px] px-3.5 justify-center items-center rounded bg-red-600 text-white font-inter text-[11px] font-bold hover:bg-red-800"
                  >
                    Cancel Flight
                  </button>
                )}
              </div>

              {/* RIGHT: seat selection + continue */}
              <div className="flex flex-col items-start gap-2 w-full md:w-[300px] md:shrink-0 rounded-lg border border-[#D1C7EB] bg-white p-3">
                <span className="text-[#2E2E2E] font-inter text-xs font-bold">Select seats</span>

                <div className="flex flex-col gap-1 w-full rounded border border-[#D1C7EB] bg-white p-2 max-h-[260px] overflow-y-auto">
                  {openSeats.map((seat) => (
                    <label
                      key={seat.id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-2 cursor-pointer hover:bg-[#F2EDFC]"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedSeatIds.includes(seat.id)}
                          onChange={() => handleSeatToggle(seat.id)}
                          className="accent-[#5C339E]"
                        />
                        <span className="text-[#2E2E2E] font-inter text-[11px]">
                          Seat {seat.seat_no} · {capitalize(seat.tier)}
                        </span>
                      </div>

                      <span className="text-[#737373] font-inter text-[10px]">
                        {dollars(seat.fare_cents)}
                      </span>
                    </label>
                  ))}
                </div>

                <p className="text-[#804DD9] font-inter text-[11px] font-bold">
                  {selectedSeats.length} seat(s) selected
                  {selectedSeats.length > 0 &&
                    `: ${selectedSeats.map((seat) => seat.seat_no).join(", ")}`}
                </p>

                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={selectedSeats.length === 0}
                  className="cursor-pointer flex w-full py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue to booking
                </button>

               
              </div>
            </div>
          </>
        )}
      </div>
      {showCancelModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">

          <h2 className="text-[#2E2E2E] font-inter text-lg font-bold">
            Confirm Flight Cancellation
          </h2>

          <p className="mt-2 text-[#737373] font-inter text-sm">
            Enter your employee password to confirm cancellation of flight{" "}
            <strong>{flight?.flight_no}</strong>.
          </p>

          <form
            onSubmit={handleConfirmCancellation}
            className="mt-5 flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-[#2E2E2E] font-inter text-xs font-bold">
              Employee Password

              <input
                type="password"
                required
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-md border border-[#D1C7EB] px-3 py-2 text-sm font-normal outline-none focus:border-[#5C339E]"
              />
            </label>

            {cancelError && (
              <p className="text-red-600 font-inter text-xs">
                {cancelError}
              </p>
            )}

            <div className="flex justify-end gap-2 mt-2">

              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="rounded-md border border-[#D1C7EB] px-4 py-2 text-xs font-bold text-[#2E2E2E] hover:bg-gray-100"
              >
                Go Back
              </button>

              <button
                type="submit"
                disabled={cancelling || !cancelPassword}
                className="rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </button>

            </div>
          </form>
        </div>
      </div>
    )}
    </div>
  );
}