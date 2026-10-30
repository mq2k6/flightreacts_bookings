
import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase";
export default function HomePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [directOnly, setDirectOnly] = useState(true);
  const [seatTier, setSeatTier] = useState("Any");
  const [searchSubmitted, setsearchSubmitted] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  //useEffect(() => {//ensures the user is logged in to access homepage
 // async function getUser() {
  //  const { data: { user }, error } = await supabase.auth.getUser();

  //  if (error || !user) {
  //    navigate("/login");
   //   return;
  //  }

//    setUserId(user.id);
//  }

 // getUser();
 // }, [navigate]);


  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
   

    // TODO: Connect to flight search API
    console.log("Searching flights:", {
      from,
      to,
      departureDate,
      maxPrice,
      departureTime,
      directOnly,
      seatTier,
    });
  }


  function handleViewDetails() {
    window.location.href = "/flight-details";
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
            onClick={() => navigate("/login")}
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
        {/*!searchSubmitted && (
          <div className="flex flex-col items-start gap-2.5 w-full">

            <h2 className="text-[#2E2E2E] font-inter text-xs font-bold">
              Your upcoming flights
            </h2>

            {upcoming.length > 0 ? (
              upcoming.map((flight) => (
                <div
                  key={flight.id}
                  className="flex flex-wrap py-2 px-2.5 justify-between items-center gap-3 rounded-md border border-[#D1C7EB] bg-white w-full"
                >

                  <div className="flex flex-col items-start gap-[3px] min-w-0">
                    <p className="text-[#2E2E2E] font-inter text-xs font-bold">
                      {flight.flight_number} · {flight.from} → {flight.to}
                    </p>

                    <p className="text-[#737373] font-inter text-[10px]">
                      {flight.departure_date} · {flight.departure_time} → {flight.arrival_time} · Seat {flight.seat_number} ({flight.seat_tier})
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleViewDetails(flight.id)}
                    className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[11px] font-bold hover:bg-[#F2EDFC]"
                  >
                    View details
                  </button>

                </div>
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

        {/*Search Results */}
        {/*searchSubmitted && (
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

            {searchResults.length > 0 ? (
              searchResults.map((flight) => (
                <div
                  key={flight.id}
                  className="flex flex-wrap py-2 px-2.5 justify-between items-center gap-3 rounded-md border border-[#D1C7EB] bg-white w-full"
                >

                  <div className="flex flex-col items-start gap-[3px] min-w-0">
                    <p className="text-[#2E2E2E] font-inter text-xs font-bold">
                      {flight.flight_number} · {flight.from} → {flight.to}
                    </p>

                    <p className="text-[#737373] font-inter text-[10px]">
                      {flight.departure_date} · {flight.departure_time} → {flight.arrival_time} · ${flight.price}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleBookFlight(flight.id)}
                    className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[11px] font-bold hover:bg-[#F2EDFC]"
                  >
                    Book flight
                  </button>

                </div>
              ))
            ) : (
              <p className="text-[#737373] font-inter text-[10px]">
                No flights found matching your search.
              </p>
            )}

          </div>
        )*/}
      </div>
    </div>
  );
}
