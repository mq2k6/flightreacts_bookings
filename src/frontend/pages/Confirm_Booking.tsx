import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getUserId } from "../utils/auth";

type Tier = "premium" | "standard" | "economy";

interface Seat {
  id: number;
  seat_no: string;
  tier: Tier;
  fare_cents: number;
  taken: boolean;
}

interface FlightInfo {
  id: number;
  flight_no: string;
  from_code: string;
  from_timezone: string;
  to_code: string;
  depart_at: string;
  fares_cents: Record<Tier, number>;
  seats: Seat[];
}

interface Traveler {
  full_name: string;
  passport_no: string;
  bag: boolean;
}

const TAX_PERCENT = 14;
const BAG_CENTS = 1500;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const money = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

// Integer math so the frontend and backend always round the same way
const taxFor = (fareCents: number) =>
  Math.floor((fareCents * TAX_PERCENT + 50) / 100);

const formatCardNumber = (v: string) =>
  v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();

const formatExp = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function formatDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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


const inputClass =
  "py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]";

export default function Confirm_Booking() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = getUserId();
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [travelers, setTravelers] = useState<Record<string, Traveler>>({});
  const [card, setCard] = useState({ number: "", exp: "", cvc: "" });

  const requestedSeatNos = useMemo(
    () => (searchParams.get("seats") ?? "").split(",").filter(Boolean),
    [searchParams]
  );

  useEffect(() => {
    async function loadFlight() {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch(`http://localhost:8000/flights/${id}`, {
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

        const data = await response.json();

        // Same mapping as the flight details page
        setFlight({
          ...data,
          seats: data.seats.map((seat: any) => ({
            id: seat.id,
            seat_no: seat.seat_no,
            tier: seat.tier,
            taken: !seat.available,
            fare_cents: data.fares_cents[seat.tier],
          })),
        });
      } catch (err) {
        console.error("Error loading flight:", err);
        setError("Unable to load this flight. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    loadFlight();
  }, [id, navigate]);

  // Only seats that exist and are still open, in the order they were picked
  const selectedSeats = useMemo(() => {
    if (!flight) return [];
    return requestedSeatNos
      .map((no) => flight.seats.find((s) => s.seat_no === no && !s.taken))
      .filter((s): s is Seat => Boolean(s));
  }, [flight, requestedSeatNos]);

  const someUnavailable =
    flight !== null && selectedSeats.length !== requestedSeatNos.length;

  const getTraveler = (seatNo: string): Traveler =>
    travelers[seatNo] ?? { full_name: "", passport_no: "", bag: false };

  function updateTraveler(seatNo: string, changes: Partial<Traveler>) {
    setTravelers((prev) => ({
      ...prev,
      [seatNo]: { ...getTraveler(seatNo), ...changes },
    }));
  }

  const fareTotal = selectedSeats.reduce((sum, s) => sum + s.fare_cents, 0);
  const taxTotal = selectedSeats.reduce((sum, s) => sum + taxFor(s.fare_cents), 0);
  const bagCount = selectedSeats.filter((s) => getTraveler(s.seat_no).bag).length;
  const bagTotal = bagCount * BAG_CENTS;
  const grandTotal = fareTotal + taxTotal + bagTotal;

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    navigate("/login");
  }
  function handleAccount(id: string) {
  navigate(`/account/${id}`);
}
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!flight || selectedSeats.length === 0 || someUnavailable) return;

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      // Step 1: the mock "processor" charges the card and returns a token
      const payRes = await fetch("http://localhost:8000/payments/mock-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          card_number: card.number,
          exp: card.exp,
          cvc: card.cvc,
        }),
      });

      // Fake processing delay so it feels real
      await new Promise((r) => setTimeout(r, 1200));

      if (payRes.status === 401) {
        handleLogout();
        return;
      }
      if (!payRes.ok) {
        const body = await payRes.json().catch(() => null);
        setSubmitError(typeof body?.detail === "string" ? body.detail : "Payment failed.");
        return;
      }
      const { payment_token } = await payRes.json();

      // Step 2: create the booking using the payment token (never the card)
      const response = await fetch("http://localhost:8000/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          flight_id: flight.id,
          payment_token,
          travelers: selectedSeats.map((seat) => {
            const t = getTraveler(seat.seat_no);
            return {
              seat_no: seat.seat_no,
              full_name: t.full_name.trim(),
              passport_no: t.passport_no.trim(),
              checked_bags: t.bag ? 1 : 0,
            };
          }),
        }),
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSubmitError(
          typeof body?.detail === "string"
            ? body.detail
            : "Unable to complete your booking. Please try again."
        );
        return;
      }

      const userId = getUserId();
        if (userId === null) {
        navigate("/home");
        return;
        }
        handleAccount(String(userId));
    } catch (err) {
      console.error("Error creating booking:", err);
      setSubmitError("Unable to complete your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const seatLabel =
    selectedSeats.length === 1
      ? `Seat ${selectedSeats[0].seat_no} (${capitalize(selectedSeats[0].tier)})`
      : `Seats ${selectedSeats.map((s) => s.seat_no).join(", ")}`;

  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white min-h-screen w-full overflow-hidden">
      {/* Navigation Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">
          Flight Reservation System
        </p>
        <nav className="flex gap-3 text-[#737373] font-inter text-[10px]">
          <Link to="/home" className="hover:text-[#5C339E]">Home</Link>
          <Link to={`/account/${userId}`}  className="hover:text-[#5C339E]">My Account</Link>
          <button type="button" onClick={handleLogout} className="hover:text-[#5C339E]">
            Log out
          </button>
        </nav>
      </div>

      {/* Main Content */}
<div className="flex py-4 px-5 flex-col items-start gap-3 w-full max-w-[720px] mx-auto">        {loading ? (
          <p className="text-[#737373] font-inter text-[11px]">Loading booking...</p>
        ) : error || !flight ? (
          <>
            <p className="text-[#737373] font-inter text-[11px]">
              {error || "Flight not found."}
            </p>
            <Link to="/home" className="text-[#804DD9] font-inter text-[11px] font-bold hover:underline">
              ← Back to home
            </Link>
          </>
        ) : requestedSeatNos.length === 0 || selectedSeats.length === 0 || someUnavailable ? (
          <>
            <p className="text-[#737373] font-inter text-[11px]">
              {requestedSeatNos.length === 0
                ? "No seats were selected."
                : "One or more of the seats you picked are no longer available."}
            </p>
            <Link
              to={`/flight-details/${id}`}
              className="text-[#804DD9] font-inter text-[11px] font-bold hover:underline"
            >
              ← Back to seat selection
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col items-start gap-3 w-full">
            <h1 className="text-[#2E2E2E] font-inter text-lg font-bold">Review &amp; pay</h1>

            <p className="text-[#2E2E2E] font-inter text-[11px]">
              Flight {flight.flight_no} · {flight.from_code} → {flight.to_code}
              {" · "}
              {formatDate(flight.depart_at, flight.from_timezone)},{" "}
              {formatTime(flight.depart_at, flight.from_timezone)}
              {" · "}
              {seatLabel}
            </p>

            {/* Traveler details, one block per seat */}
            {selectedSeats.map((seat, index) => {
              const t = getTraveler(seat.seat_no);
              return (
                <div key={seat.id} className="flex flex-col gap-2 w-full">
                  {selectedSeats.length > 1 && (
                    <p className="text-[#2E2E2E] font-inter text-[11px] font-bold">
                      Traveler {index + 1} · Seat {seat.seat_no} ({capitalize(seat.tier)})
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 w-full">
                    <label className="flex flex-col items-start gap-1 flex-[2] min-w-[200px]">
                      <span className="text-[#737373] font-inter text-[10px]">Full name</span>
                      <input
                        type="text"
                        required
                        placeholder="As shown on passport"
                        value={t.full_name}
                        onChange={(e) => updateTraveler(seat.seat_no, { full_name: e.target.value })}
                        className={inputClass}
                      />
                    </label>

                    <label className="flex flex-col items-start gap-1 flex-1 min-w-[140px]">
                      <span className="text-[#737373] font-inter text-[10px]">Passport #</span>
                      <input
                        type="text"
                        required
                        value={t.passport_no}
                        onChange={(e) => updateTraveler(seat.seat_no, { passport_no: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-1.5 text-[#2E2E2E] font-inter text-[10px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={t.bag}
                      onChange={(e) => updateTraveler(seat.seat_no, { bag: e.target.checked })}
                      className="accent-[#5C339E]"
                    />
                    Add a checked bag (+{money(BAG_CENTS)})
                  </label>
                </div>
              );
            })}

            {/* Fare breakdown */}
            <div className="flex flex-col gap-1 w-full rounded-lg border border-[#D1C7EB] bg-white p-3 text-[#2E2E2E] font-inter text-[11px]">
              {selectedSeats.map((seat) => (
                <div key={seat.id} className="flex justify-between">
                  <span>
                    Seat {seat.seat_no} fare ({capitalize(seat.tier)})
                  </span>
                  <span>{money(seat.fare_cents)}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span>Taxes &amp; fees</span>
                <span>{money(taxTotal)}</span>
              </div>
              {bagCount > 0 && (
                <div className="flex justify-between">
                  <span>Checked bag{bagCount > 1 ? `s (${bagCount})` : ""}</span>
                  <span>{money(bagTotal)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{money(grandTotal)}</span>
              </div>
            </div>

            <p className="text-[#737373] font-inter text-[10px]">
              Cancellation policy: full refund up to 24h after booking; 80% refund until 48h
              before departure.
            </p>

            {/* Payment (mock processor) */}
            <div className="flex flex-col items-start gap-1 w-full">
              <span className="text-[#737373] font-inter text-[10px]">Payment</span>
              <div className="flex flex-wrap gap-2 w-full">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="Card number"
                  value={card.number}
                  onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                  className={`${inputClass} flex-[2] min-w-[200px]`}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="MM/YY"
                  value={card.exp}
                  onChange={(e) => setCard({ ...card, exp: formatExp(e.target.value) })}
                  className={`${inputClass} w-20`}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  placeholder="CVC"
                  maxLength={4}
                  value={card.cvc}
                  onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "") })}
                  className={`${inputClass} w-16`}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Processing..." : `Confirm & pay ${money(grandTotal)}`}
                </button>
              </div>
              <p className="text-[#737373] font-inter text-[10px]">
                Demo only. Use 4242 4242 4242 4242 with any future date and CVC. Use
                4000 0000 0000 0002 to test a decline.
              </p>
            </div>

            {submitError && (
              <p className="text-[#B3261E] font-inter text-[11px]">{submitError}</p>
            )}

            <Link
              to={`/flight-details/${id}`}
              className="text-[#804DD9] font-inter text-[10px] font-bold hover:underline"
            >
              ← Change seats
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}