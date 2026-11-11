import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUserId, getEmployeeId, getAdmin } from "../utils/auth";

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

  // Plane seating configuration
  seat_layout: number[];
  total_columns: number;
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

const dollars = (amount: number) => `$${amount.toFixed(2)}`;
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
  const [admin, setAdmin] = useState(getAdmin());  

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

  // Map actual seats by their seat number (e.g. "1A", "1B")
const seatMap = useMemo(
  () =>
    new Map<string, Seat>(
      (flight?.seats ?? []).map(
        (seat): [string, Seat] => [seat.seat_no, seat]
      )
    ),
  [flight]
);

const seatRows = useMemo(
  () =>
    [...new Set(
      (flight?.seats ?? []).map((seat) => parseInt(seat.seat_no, 10))
    )].sort((a, b) => a - b),
  [flight]
);

  // Generate the seat column letters and divide them into aisle-separated groups
const seatGroups = useMemo(() => {
  if (!flight) return [];

  const widths = [...(flight.seat_layout ?? [])];
  const totalColumns = flight.total_columns ?? 0;

  const layoutTotal = widths.reduce((sum, width) => sum + width, 0);

  if (layoutTotal < totalColumns) {
    widths.push(totalColumns - layoutTotal);
  }

  let columnIndex = 0;

  // Skip column I because aircraft do not use it
  const getColumnLetter = () => {
    const letter = String.fromCharCode(65 + columnIndex);
    columnIndex++;

    if (letter === "I") {
      return getColumnLetter();
    }

    return letter;
  };

  return widths
    .filter((width) => width > 0)
    .map((groupSize) =>
      Array.from({ length: groupSize }, getColumnLetter)
    );
}, [flight]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    localStorage.removeItem("employee");
    localStorage.setItem("admin", "false")
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
      setCancelError(data.detail || "Flight cancellation failed.");
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
          {employeeId!=null && admin==false && <button
            type="button"
            onClick={() => {
              localStorage.setItem("admin", "true");
              setAdmin(true);
            }}
            className="hover:text-[#5C339E]"
            >
            Admin Mode
            </button>}

            {employeeId!=null && admin==true && <button
            type="button"
            onClick={() => {
              localStorage.setItem("admin", "false");
              setAdmin(false);
            }}
            className="hover:text-[#5C339E]"
            >
            Exit Admin Mode
            </button>}
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
                  Price depends on where the seat is in the plane. Click an open seat
                  on the map to choose it.
                </p>

                {selectedSeats.length > 0 && (
                  <p className="text-[#804DD9] font-inter text-[11px] font-bold">
                    Selected: {selectedSeats.map((seat) => seat.seat_no).join(", ")}
                    {" · "}
                    {selectedSeats.map((seat) => capitalize(seat.tier)).join(", ")}
                    {" · "}
                    {dollars(selectedSeats.reduce((total, seat) => total + seat.fare_cents, 0))}
                  </p>
                )}

                {!admin && (
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={selectedSeats.length === 0}
                    className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to booking
                  </button>
                )}

                {/* Keep employee cancellation functionality */}
                {employeeId !== null && admin && (
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[red] text-white font-inter text-[11px] font-bold hover:bg-[maroon] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel Flight
                  </button>
                )}
              </div>

              {/* RIGHT: visual seat map */}
              <div className="flex flex-col items-start gap-2 w-full md:w-[300px] md:shrink-0 rounded-lg border border-[#D1C7EB] bg-white p-3">

                <span className="text-[#2E2E2E] font-inter text-xs font-bold">
                  Seat map
                </span>

                <div className="w-full flex flex-col items-center gap-2">

                  {/* Front of plane */}
                  <div className="flex items-center gap-1 text-[#737373] font-inter text-[10px]">
                    <span>▲</span>
                    <span>Front of plane</span>
                  </div>

                  {/* Column letters */}
                  <div className="flex flex-col gap-1 w-full">

                    <div className="flex items-center gap-1">
                      <div className="w-5 shrink-0" />

                      <div className="flex flex-1 justify-center gap-4">
                        {seatGroups.map((group, groupIndex) => (
                          <div key={groupIndex} className="flex gap-1">
                            {group.map((letter) => (
                              <div
                                key={letter}
                                className="w-5 text-center text-[#737373] font-inter text-[9px]"
                              >
                                {letter}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actual seat rows */}
                    {seatRows.map((row) => (
                      <div key={row} className="flex items-center gap-1">

                        {/* Row number */}
                        <span className="w-5 shrink-0 text-right text-[#737373] font-inter text-[9px]">
                          {row}
                        </span>

                        {/* Seat groups with aisles */}
                        <div className="flex flex-1 justify-center gap-4">

                          {seatGroups.map((group, groupIndex) => (
                            <div key={groupIndex} className="flex gap-1">

                              {group.map((letter) => {
                                const seat = seatMap.get(`${row}${letter}`);

                                // Leave a blank space when this seat position doesn't exist
                                if (!seat) {
                                  return (
                                    <div
                                      key={letter}
                                      className="w-5 h-5 shrink-0"
                                    />
                                  );
                                }

                                const selected = selectedSeatIds.includes(seat.id);

                                let seatStyle = "";

                                if (selected) {
                                  seatStyle = "bg-pink-500 border-pink-500";
                                } else if (seat.taken) {
                                  seatStyle = "bg-white border-[#D1C7EB]";
                                } else if (seat.tier === "premium") {
                                  seatStyle = "bg-[#452078] border-[#452078]";
                                } else if (seat.tier === "standard") {
                                  seatStyle = "bg-[#9872D1] border-[#9872D1]";
                                } else {
                                  seatStyle = "bg-[#DCCFF5] border-[#DCCFF5]";
                                }

                                return (
                                  <button
                                    key={seat.id}
                                    type="button"
                                    title={`Seat ${seat.seat_no} · ${capitalize(seat.tier)} · ${dollars(seat.fare_cents)}`}
                                    disabled={seat.taken || admin}
                                    onClick={() => handleSeatToggle(seat.id)}
                                    className={`w-5 h-5 shrink-0 rounded-[3px] border ${seatStyle}
                                      ${!seat.taken && !admin ? "cursor-pointer hover:ring-2 hover:ring-[#804DD9]" : ""}
                                      ${seat.taken || admin ? "cursor-default" : ""}
                                    `}
                                  />
                                );
                              })}

                            </div>
                          ))}

                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-col gap-1 w-full mt-2">

                    <div className="flex items-center gap-2 text-[#444] font-inter text-[10px]">
                      <div className="w-3 h-3 rounded-[3px] bg-[#452078]" />
                      Premium {dollars(flight.fares_cents.premium)}
                    </div>

                    <div className="flex items-center gap-2 text-[#444] font-inter text-[10px]">
                      <div className="w-3 h-3 rounded-[3px] bg-[#9872D1]" />
                      Standard {dollars(flight.fares_cents.standard)}
                    </div>

                    <div className="flex items-center gap-2 text-[#444] font-inter text-[10px]">
                      <div className="w-3 h-3 rounded-[3px] bg-[#DCCFF5]" />
                      Economy {dollars(flight.fares_cents.economy)}
                    </div>

                    <div className="flex items-center gap-2 text-[#444] font-inter text-[10px]">
                      <div className="w-3 h-3 rounded-[3px] border border-[#D1C7EB] bg-white" />
                      Taken
                    </div>

                    <div className="flex items-center gap-2 text-[#444] font-inter text-[10px]">
                      <div className="w-3 h-3 rounded-[3px] bg-pink-500" />
                      Your seat
                    </div>

                  </div>
                </div>
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
