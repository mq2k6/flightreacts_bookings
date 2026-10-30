export interface Flight {
  // search results use `id`; upcoming bookings use `flight_id` + `booking_id`
  id?: number;
  flight_id?: number;
  booking_id?: number;
  flight_no: string;
  from: string;
  from_code: string;
  to: string;
  to_code: string;
  depart_at: string;
  arrive_at: string;
  // upcoming only
  seat_no?: string;
  tier?: string;
  // search only
  fares_cents?: { premium: number; standard: number; economy: number };
}

interface FlightCardProps {
  flight: Flight;
  type: "upcoming" | "search";
  onAction: (id: number) => void;
}

const formatDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date TBD";

const formatTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lowestFare(fares?: Flight["fares_cents"]) {
  if (!fares) return null;
  const values = Object.values(fares).filter((v) => typeof v === "number");
  return values.length ? Math.min(...values) / 100 : null;
}

export default function FlightCard({ flight, type, onAction }: FlightCardProps) {
  const details = [
    formatDate(flight.depart_at),
    `${formatTime(flight.depart_at)} → ${formatTime(flight.arrive_at)}`,
  ];

  if (flight.seat_no) {
    details.push(
      `Seat ${flight.seat_no}${flight.tier ? ` (${capitalize(flight.tier)})` : ""}`
    );
  }

  if (type === "search") {
    const fare = lowestFare(flight.fares_cents);
    if (fare !== null) details.push(`From $${fare.toFixed(2)}`);
  }

  const flightId = flight.flight_id ?? flight.id;

  return (
    <div className="flex items-center justify-between gap-3 w-full rounded-lg border border-[#D1C7EB] bg-white px-4 py-3">
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-[#2E2E2E] font-inter text-sm font-bold">
          {flight.flight_no} · {flight.from} ({flight.from_code}) → {flight.to} (
          {flight.to_code})
        </p>
        <p className="text-[#737373] font-inter text-[11px]">
          {details.join(" · ")}
        </p>
      </div>

      <button
        type="button"
        onClick={() => flightId !== undefined && onAction(flightId)}
        className="cursor-pointer shrink-0 rounded-md border border-[#D1C7EB] bg-white px-4 py-2 text-[#2E2E2E] font-inter text-xs font-bold hover:bg-[#F2EDFC]"
      >
        {type === "upcoming" ? "View details" : "Book"}
      </button>
    </div>
  );
}