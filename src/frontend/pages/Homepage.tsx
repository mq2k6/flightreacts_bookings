
import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";

interface Flight {
  id: number;
  flight_number: string;
  from: string;
  to: string;
  departure_date: string;
  departure_time: string;
  arrival_time: string;
  price?: number;
  seat_number?: string;
  seat_tier?: string;
}

interface FlightCardProps {
  flight: Flight;
  type: "upcoming" | "search";
  onAction: (id: number) => void;
}

function FlightCard({ flight, type, onAction }: FlightCardProps) {
  return (
    <div className="flex flex-wrap py-2 px-2.5 justify-between items-center gap-3 rounded-md border border-[#D1C7EB] bg-white w-full">

      <div className="flex flex-col items-start gap-[3px] min-w-0">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">
          {flight.flight_number} · {flight.from} → {flight.to}
        </p>

        <p className="text-[#737373] font-inter text-[10px]">
          {flight.departure_date} · {flight.departure_time} → {flight.arrival_time}
          {type === "upcoming" && flight.seat_number
            ? ` · Seat ${flight.seat_number} (${flight.seat_tier ?? "N/A"})`
            : ""}
          {type === "search" && flight.price !== undefined
            ? ` · $${flight.price}`
            : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onAction(flight.id)}
        className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[11px] font-bold hover:bg-[#F2EDFC]"
      >
        {type === "upcoming" ? "View details" : "Book flight"}
      </button>

    </div>
  );
}

export default function HomePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [directOnly, setDirectOnly] = useState(true);
  const [seatTier, setSeatTier] = useState("Any");

  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  const [searchSubmitted, setsearchSubmitted] = useState(false);
  const [searchResults, setSearchResults] = useState<Flight[]>([]);
  const [upcoming, setUpcoming] = useState<Flight[]>([]);

  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
  async function getUser() {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    // First, verify the user is authenticated
    try {
      const response = await fetch("http://localhost:8000/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        localStorage.removeItem("token");
        localStorage.removeItem("passenger");
        navigate("/login");
        return;
      }

      const passenger = await response.json();
      setUserId(passenger.id);

    } catch (error) {
      console.error("Error verifying user:", error);
      navigate("/login");
      return;
    }

    // Then, independently try to load upcoming flights
    try {
      const flightsResponse = await fetch(
        "http://localhost:8000/flights/upcoming",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!flightsResponse.ok) {
        console.log("Upcoming flights endpoint unavailable.");
        setUpcoming([]);
        return;
      }

      const flightsData = await flightsResponse.json();
      setUpcoming(flightsData);

    } catch (error) {
      console.error("Error loading upcoming flights:", error);
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  }

  getUser();
}, [navigate]);


  async function handleSearch(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const token = localStorage.getItem("token");

  if (!token) {
    navigate("/login");
    return;
  }

  setsearchSubmitted(true);
  setLoadingSearch(true);
  setError("");
  setSearchResults([]);

  try {
    const params = new URLSearchParams({
      from,
      to,
      departure_date: departureDate,
      max_price: maxPrice,
      departure_time: departureTime,
      direct_only: String(directOnly),
      seat_tier: seatTier,
    });

    const response = await fetch(
      `http://localhost:8000/flights/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to search flights");
    }

    const data = await response.json();
    setSearchResults(data);

  } catch (error) {
    console.error("Error searching flights:", error);
    setError("Unable to search flights. Please try again.");
  } finally {
    setLoadingSearch(false);
  }
}

  function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("passenger");

  setUserId(null); // If you're tracking userId in state

  navigate("/login");
}

function handleViewDetails(id: number) {
  navigate(`/flight-details/${id}`);
}

function handleBookFlight(id: number) {
  navigate(`/booking/${id}`);
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

            <Link to="/account" className="hover:text-[#5C339E]">
            My Account
            </Link>

            <button
            type="button"
            onClick={() => handleLogout()}
            className="hover:text-[#5C339E]"
            >
            Log out
            </button>

        </nav>
        </div>

      {/* Main Content */}
      <div className="flex py-4 px-5 flex-col items-start gap-2.5 w-full">

        <h1 className="text-[#2E2E2E] font-inter text-lg font-bold">
          Where to next?
        </h1>

        {/* Flight Search Form */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col items-start gap-2.5 w-full"
        >
          {/* Search Fields */}
          <div className="flex flex-wrap items-end gap-2 w-full">

            <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
              <span className="text-[#737373] font-inter text-[10px]">
                From
              </span>
              <input
                type="text"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
              />
            </label>

            <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
              <span className="text-[#737373] font-inter text-[10px]">
                To
              </span>
              <input
                type="text"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
              />
            </label>

            <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
              <span className="text-[#737373] font-inter text-[10px]">
                Departure date
              </span>
              <input
                type="date"
                required
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
              />
            </label>

          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 w-full">

            <span className="text-[#737373] font-inter text-[10px]">
              Filters:
            </span>

            <label className="flex items-center gap-1 py-[5px] px-2.5 rounded-xl border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[10px]">
              Max price: $
              <input
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-12 outline-none bg-transparent"
              />
            </label>

            <label className="flex items-center gap-1 py-[5px] px-2.5 rounded-xl border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[10px]">
              Departure:
              <select
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="outline-none bg-transparent"
              >
                <option>Any</option>
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Evening</option>
              </select>
            </label>

            <label className="flex items-center gap-1 py-[5px] px-2.5 rounded-xl border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[10px] cursor-pointer">
              <input
                type="checkbox"
                checked={directOnly}
                onChange={(e) => setDirectOnly(e.target.checked)}
                className="accent-[#5C339E]"
              />
              Direct only
            </label>

            <label className="flex items-center gap-1 py-[5px] px-2.5 rounded-xl border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[10px]">
              Seat tier:
              <select
                value={seatTier}
                onChange={(e) => setSeatTier(e.target.value)}
                className="outline-none bg-transparent"
              >
                <option>Any</option>
                <option>Economy</option>
                <option>Premium</option>
                <option>Business</option>
                <option>First</option>
              </select>
            </label>

          </div>

          {/* Search Button */}
          <button
            type="submit"
            className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D]"
          >
            Search flights
          </button>

        </form>

       {/* Upcoming Flights */}
        {!searchSubmitted && (
          <div className="flex flex-col items-start gap-2.5 w-full">

            <h2 className="text-[#2E2E2E] font-inter text-xs font-bold">
              Your upcoming flights
            </h2>

            {loadingUpcoming ? (
              <p className="text-[#737373] font-inter text-[10px]">
                Loading your upcoming flights...
              </p>
            ) : upcoming.length > 0 ? (
              upcoming.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  type="upcoming"
                  onAction={handleViewDetails}
                />
              ))
            ) : (
              <p className="text-[#737373] font-inter text-[10px]">
                You don't have any upcoming flights.
              </p>
            )}

            <p className="text-[#737373] font-inter text-[10px] w-full max-w-[560px]">
              All your reservations can be viewed in My Account.
            </p>

          </div>
        )}

        {/* Search Results */}
        {searchSubmitted && (
          <div className="flex flex-col items-start gap-2.5 w-full">

            <h2 className="text-[#2E2E2E] font-inter text-xs font-bold">
              Available flights
            </h2>

            <button
              type="button"
              onClick={() => setsearchSubmitted(false)}
              className="text-[#804DD9] font-inter text-[10px] font-bold hover:underline"
            >
              ← Back to upcoming flights
            </button>

            {loadingSearch ? (
              <p className="text-[#737373] font-inter text-[10px]">
                Searching for flights...
              </p>
            ) : error ? (
              <p className="text-[#737373] font-inter text-[10px]">
                {error}
              </p>
            ) : searchResults.length > 0 ? (
              searchResults.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  type="search"
                  onAction={handleBookFlight}
                />
              ))
            ) : (
              <p className="text-[#737373] font-inter text-[10px]">
                No flights found matching your search.
              </p>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
