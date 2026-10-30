import FlightCard, { type Flight } from "./FlightCard";

interface FlightListProps {
  flights: Flight[];
  type: "upcoming" | "search";
  onAction: (id: number) => void;
}

export default function FlightList({ flights, type, onAction }: FlightListProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {flights.map((flight) => (
        <FlightCard
          key={flight.id}
          flight={flight}
          type={type}
          onAction={onAction}
        />
      ))}
    </div>
  );
}