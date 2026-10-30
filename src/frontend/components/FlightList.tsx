import FlightCard, { type Flight } from "./FlightCard";

interface FlightListProps {
  flights: Flight[];
}

export default function FlightList({ flights }: FlightListProps) {
  return (
    <div className="flex flex-col gap-3">
      {flights.map((flight) => (
        <FlightCard
          key={flight.flight_id}
          flight={flight}
        />
      ))}
    </div>
  );
}