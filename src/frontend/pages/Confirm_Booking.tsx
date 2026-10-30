import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
  from_tz: string;
  to: string;
  to_code: string;
  to_tz: string;
  depart_at: string;
  arrive_at: string;
  fares_cents: Record<Tier, number>;
  seats: Seat[];
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

export default function Confirm_Booking() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [flight, setFlight] = useState<FlightDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState("");

  useEffect(() => {
    async function loadFlight() {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch(`http://localhost:8000/flights/${flight.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        });

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
        if (!response.ok) throw new Error("Request failed");

        setFlight(await response.json());
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

  const selectedSeat = openSeats.find((s) => String(s.id) === selectedSeatId);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    navigate("/login");
  }

  function handleContinue() {
    if (!selectedSeat) return;
    navigate(`/booking/${id}?seat=${encodeURIComponent(selectedSeat.seat_no)}`);
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

  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white min-h-screen w-full overflow-hidden">
      {/* Navigation Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">
          Flight Reservation System
        </p>
        <nav className="flex gap-3 text-[#737373] font-inter text-[10px]">
          <Link to="/home" className="hover:text-[#5C339E]">Home</Link>
          <Link to="/account" className="hover:text-[#5C339E]">My Account</Link>
          <button type="button" onClick={handleLogout} className="hover:text-[#5C339E]">
            Log out
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex py-4 px-5 flex-col items-start gap-3 w-full max-w-[720px]">
        {loading ? (
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
              {formatDate(flight.depart_at, flight.from_tz)}
              {" · "}
              Departs {formatTime(flight.depart_at, flight.from_tz)}
              {" · "}
              Arrives {formatTime(flight.arrive_at, flight.to_tz)}
            </p>

            {/* Seats & fares by tier */}
            <h2 className="text-[#2E2E2E] font-inter text-xs font-bold mt-2">
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

            <p className="text-[#2E2E2E] font-inter text-[11px] font-bold">
              {openSeats.length} of {flight.seats.length} seats available
            </p>

            <p className="text-[#737373] font-inter text-[10px]">
              Price depends on where the seat is in the plane. Choose an open seat
              from the list.
            </p>

            {/* Seat dropdown (placeholder for the seat map) */}
            <label className="flex flex-col items-start gap-1 w-full max-w-[260px]">
              <span className="text-[#737373] font-inter text-[10px]">Seat</span>
              <select
                value={selectedSeatId}
                onChange={(e) => setSelectedSeatId(e.target.value)}
                className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
              >
                <option value="">Select a seat...</option>
                {openSeats.map((seat) => (
                  <option key={seat.id} value={seat.id}>
                    {seat.seat_no}, {dollars(seat.fare_cents)}
                  </option>
                ))}
              </select>
            </label>

            {selectedSeat && (
              <p className="text-[#804DD9] font-inter text-[11px] font-bold">
                Selected: Seat {selectedSeat.seat_no} · {capitalize(selectedSeat.tier)} ·{" "}
                {dollars(selectedSeat.fare_cents)}
              </p>
            )}

            <button
              type="button"
              onClick={handleContinue}
              disabled={!selectedSeat}
              className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to booking
            </button>
          </>
        )}
      </div>
    </div>
  );
}