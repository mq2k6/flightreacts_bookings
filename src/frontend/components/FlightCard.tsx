export interface Flight {
  flight_id: number;
  flight_number: string;
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  price: number;
}

interface FlightCardProps {
  flight: Flight;
}

export default function FlightCard({ flight }: FlightCardProps) {
  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white p-4">
      <div className="flex w-full justify-between">
        <span>{flight.flight_number}</span>
        <span>${flight.price}</span>
      </div>

      <div className="flex w-full justify-between">
        <div>
          <h3>{flight.origin}</h3>
          <p>{new Date(flight.departure_time).toLocaleString()}</p>
        </div>

        <div>
          <h3>{flight.destination}</h3>
          <p>{new Date(flight.arrival_time).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}