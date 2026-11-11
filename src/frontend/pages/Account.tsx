import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId } from "../utils/auth";
import { Link, useNavigate } from "react-router-dom";
interface UpcomingBooking {
  booking_id: number;
  booking_ref: string;
  flight_id: number;
  flight_no: string;
  from_code: string;
  to_code: string;
  from_timezone: string;
  depart_at: string;
  seat_no: string;
  tier: string;
  total_cents: number;
  refund_cents: number;
  refund_percent: number;
}

interface HistoryRow {
  flight_id: number;
  flight_no: string;
  from_code: string;
  to_code: string;
  from_timezone: string;
  depart_at: string;
  seats: string;
}

interface AccountData {
  total_flights_taken: number;
  upcoming: UpcomingBooking[];
  history: HistoryRow[];
}

interface FlightGroup {
  flight_id: number;
  flight_no: string;
  from_code: string;
  to_code: string;
  from_timezone: string;
  depart_at: string;
  bookings: UpcomingBooking[];
}

const money = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fmt = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: tz });

const fmtTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });

export default function Account() {
  const navigate = useNavigate();

  const userId = getUserId();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Cancel modal state
  const [cancelGroup, setCancelGroup] = useState<FlightGroup | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    localStorage.removeItem("employee")
    navigate("/login");
  }

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      const res = await fetch("http://localhost:8000/account/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("passenger");
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Request failed");
      setData(await res.json());
      setError("");
    } catch (err) {
      console.error("Error loading account:", err);
      setError("Unable to load your account. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // One card per flight, listing all of the user's seats on it
  const groups = useMemo<FlightGroup[]>(() => {
    const map = new Map<number, FlightGroup>();
    for (const b of data?.upcoming ?? []) {
      const g = map.get(b.flight_id);
      if (g) {
        g.bookings.push(b);
      } else {
        map.set(b.flight_id, {
          flight_id: b.flight_id,
          flight_no: b.flight_no,
          from_code: b.from_code,
          to_code: b.to_code,
          from_timezone: b.from_timezone,
          depart_at: b.depart_at,
          bookings: [b],
        });
      }
    }
    return Array.from(map.values());
  }, [data]);

  const nextDeparture = groups[0]
    ? fmt(groups[0].depart_at, groups[0].from_timezone, { month: "short", day: "numeric" })
    : "—";

  function openCancel(group: FlightGroup) {
    setCancelGroup(group);
    setSelectedIds(group.bookings.length === 1 ? [group.bookings[0].booking_id] : []);
    setCancelError("");
  }

  function closeCancel() {
    if (cancelling) return;
    setCancelGroup(null);
    setSelectedIds([]);
    setCancelError("");
  }

  function toggleSeat(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const selectedBookings = cancelGroup
    ? cancelGroup.bookings.filter((b) => selectedIds.includes(b.booking_id))
    : [];
  const refundTotal = selectedBookings.reduce((sum, b) => sum + b.refund_cents, 0);

  async function confirmCancel() {
    if (selectedBookings.length === 0) return;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setCancelling(true);
    setCancelError("");
    try {
      const res = await fetch("http://localhost:8000/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_ids: selectedIds }),
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCancelError(
          typeof body?.detail === "string" ? body.detail : "Unable to cancel. Please try again."
        );
        return;
      }

      const result = await res.json();
      setNotice(
        `Cancelled ${result.cancelled} seat${result.cancelled > 1 ? "s" : ""}. ` +
          `Refund: ${money(result.refund_cents)}.`
      );
      setCancelGroup(null);
      setSelectedIds([]);
      await load();
    } catch (err) {
      console.error("Error cancelling:", err);
      setCancelError("Unable to cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white min-h-screen w-full overflow-hidden">
      {/* Navigation Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">Flight Reservation System</p>
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
      <div className="flex py-4 px-5 flex-col items-start gap-3 w-full max-w-[900px] mx-auto">
        <h1 className="text-[#2E2E2E] font-inter text-lg font-bold">My Account</h1>

        {loading ? (
          <p className="text-[#737373] font-inter text-[11px]">Loading your account...</p>
        ) : error || !data ? (
          <p className="text-[#737373] font-inter text-[11px]">{error || "Something went wrong."}</p>
        ) : (
          <>
            {notice && (
              <div className="flex items-center justify-between gap-3 w-full rounded-lg border border-[#D1C7EB] bg-[#F2EDFC] px-3 py-2 text-[#2E2E2E] font-inter text-[11px]">
                <span>{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice("")}
                  className="text-[#804DD9] font-bold hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
              {[
                { value: String(data.total_flights_taken), label: "Total flights taken" },
                { value: String(groups.length), label: "Upcoming flights" },
                { value: nextDeparture, label: "Next departure" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col gap-0.5 rounded-lg border border-[#D1C7EB] bg-white px-3.5 py-2.5"
                >
                  <span className="text-[#2E2E2E] font-inter text-lg font-bold">{stat.value}</span>
                  <span className="text-[#737373] font-inter text-[11px]">{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Upcoming flights */}
            <h2 className="text-[#2E2E2E] font-inter text-xs font-bold mt-1">Upcoming flights</h2>

            {groups.length === 0 ? (
              <p className="text-[#737373] font-inter text-[11px]">
                You don't have any upcoming flights.
              </p>
            ) : (
              groups.map((g) => {
                const seats = g.bookings.map((b) => b.seat_no).join(", ");
                return (
                  <div
                    key={g.flight_id}
                    className="flex items-center justify-between gap-3 w-full rounded-lg border border-[#D1C7EB] bg-white px-4 py-3"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <p className="text-[#2E2E2E] font-inter text-sm font-bold">
                        {g.flight_no} · {g.from_code} → {g.to_code}
                      </p>
                      <p className="text-[#737373] font-inter text-[11px]">
                        {fmt(g.depart_at, g.from_timezone, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                        {" · "}
                        {fmtTime(g.depart_at, g.from_timezone)}
                        {" · "}
                        {g.bookings.length === 1 ? "Seat" : "Seats"} {seats}
                      </p>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/flight-details/${g.flight_id}`)}
                        className="cursor-pointer rounded-md border border-[#D1C7EB] bg-white px-4 py-2 text-[#2E2E2E] font-inter text-xs font-bold hover:bg-[#F2EDFC]"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => openCancel(g)}
                        className="cursor-pointer rounded-md border border-[#D1C7EB] bg-white px-4 py-2 text-[#2E2E2E] font-inter text-xs font-bold hover:bg-[#F2EDFC]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Flight history */}
            <h2 className="text-[#2E2E2E] font-inter text-xs font-bold mt-1">Flight history</h2>

            {data.history.length === 0 ? (
              <p className="text-[#737373] font-inter text-[11px]">No past flights yet.</p>
            ) : (
              <div className="w-full overflow-x-auto rounded-lg border border-[#D1C7EB]">
                <table className="w-full text-left font-inter text-[11px] text-[#2E2E2E]">
                  <thead className="bg-[#F2EDFC]">
                    <tr>
                      <th className="px-3 py-2 font-bold">Flight</th>
                      <th className="px-3 py-2 font-bold">Date</th>
                      <th className="px-3 py-2 font-bold">Route</th>
                      <th className="px-3 py-2 font-bold">Seat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h) => (
                      <tr key={h.flight_id}>
                        <td className="px-3 py-2">{h.flight_no}</td>
                        <td className="px-3 py-2">
                          {fmt(h.depart_at, h.from_timezone, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {h.from_code} → {h.to_code}
                        </td>
                        <td className="px-3 py-2">{h.seats}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel modal */}
      {cancelGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeCancel}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex flex-col gap-3 w-full max-w-[460px] rounded-lg border border-[#D1C7EB] bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-[#2E2E2E] font-inter text-sm font-bold">Cancel seats</h2>
              <p className="text-[#737373] font-inter text-[11px]">
                {cancelGroup.flight_no} · {cancelGroup.from_code} → {cancelGroup.to_code} ·{" "}
                {fmt(cancelGroup.depart_at, cancelGroup.from_timezone, {
                  month: "short",
                  day: "numeric",
                })}
                , {fmtTime(cancelGroup.depart_at, cancelGroup.from_timezone)}
              </p>
            </div>

            <p className="text-[#2E2E2E] font-inter text-[11px] font-bold">
              Select the seats you want to cancel
            </p>

            <div className="flex flex-col gap-1.5 w-full max-h-[240px] overflow-y-auto">
              {cancelGroup.bookings.map((b) => (
                <label
                  key={b.booking_id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#D1C7EB] px-3 py-2 cursor-pointer hover:bg-[#F2EDFC]"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(b.booking_id)}
                      onChange={() => toggleSeat(b.booking_id)}
                      className="accent-[#5C339E]"
                    />
                    <div className="flex flex-col">
                      <span className="text-[#2E2E2E] font-inter text-[11px] font-bold">
                        Seat {b.seat_no} · {capitalize(b.tier)}
                      </span>
                      <span className="text-[#737373] font-inter text-[10px]">
                        Paid {money(b.total_cents)} · Ref {b.booking_ref}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-[#2E2E2E] font-inter text-[11px] font-bold">
                      {money(b.refund_cents)}
                    </span>
                    <span className="text-[#737373] font-inter text-[10px]">
                      {b.refund_percent}% refund
                    </span>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-between items-center w-full rounded-lg border border-[#D1C7EB] bg-[#F2EDFC] px-3 py-2 text-[#2E2E2E] font-inter text-[11px] font-bold">
              <span>
                Total refund ({selectedBookings.length} seat
                {selectedBookings.length === 1 ? "" : "s"})
              </span>
              <span>{money(refundTotal)}</span>
            </div>

            <p className="text-[#737373] font-inter text-[10px]">
              Cancellation policy: full refund up to 24h after booking; 80% refund until 48h
              before departure.
            </p>

            {cancelError && (
              <p className="text-[#B3261E] font-inter text-[11px]">{cancelError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCancel}
                disabled={cancelling}
                className="cursor-pointer rounded-md border border-[#D1C7EB] bg-white px-4 py-2 text-[#2E2E2E] font-inter text-[11px] font-bold hover:bg-[#F2EDFC] disabled:opacity-50"
              >
                Keep booking
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling || selectedBookings.length === 0}
                className="cursor-pointer rounded-md bg-[#5C339E] px-4 py-2 text-white font-inter text-[11px] font-bold hover:bg-[#48277D] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? "Cancelling..." : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}