
import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import FlightCard, { type Flight } from "../components/FlightCard";
import { getUserId, getEmployeeId, getAdmin } from "../utils/auth";

type Plane = {
  id: number;
  model: string;
};

function groupByFlight(rows: Flight[]): Flight[] {
  const map = new Map<number, Flight>();

  for (const row of rows) {
    const key = row.flight_id ?? row.id!;
    const seat = row.seat_no
      ? { seat_no: row.seat_no, tier: row.tier ?? "" }
      : null;

    const existing = map.get(key);
    if (existing) {
      if (seat) existing.seats!.push(seat);
    } else {
      map.set(key, { ...row, seats: seat ? [seat] : [] });
    }
  }

  return Array.from(map.values());
}

export default function HomePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [directOnly, setDirectOnly] = useState(true);
  const [seatTier, setSeatTier] = useState("Any");
  const [admin, setAdmin] = useState(getAdmin());  
  const userId = getUserId();
  const employeeId =getEmployeeId();
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<Plane[]>([]);
  const [planeId, setPlaneId] = useState("");
  const [adminDepartureTime, setAdminDepartureTime] = useState("");
  const [searchSubmitted, setsearchSubmitted] = useState(false);
  const [searchResults, setSearchResults] = useState<Flight[]>([]);
  const [upcoming, setUpcoming] = useState<Flight[]>([]);

  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState("");

useEffect(() => {
  async function getUser() {
    const token = localStorage.getItem("token");

    if (!token || (userId === null && employeeId === null)) {
      navigate("/login");
      return;
    }

    if (userId === null) {
      setLoadingUpcoming(false);
      return;
    }

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
        setUpcoming([]);
        return;
      }

      const flightsData = await flightsResponse.json();
      setUpcoming(
        Array.isArray(flightsData) ? groupByFlight(flightsData) : []
      );

    } catch (error) {
      console.error("Error loading upcoming flights:", error);
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  }

  getUser();
}, [navigate, userId, employeeId]);

useEffect(() => {
  async function loadPlanes() {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch("http://localhost:8000/planes", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load planes");
      }

      const data = await response.json();
      setPlanes(data);
    } catch (error) {
      console.error("Error loading planes:", error);
    }
  }

  if (employeeId !== null) {
    loadPlanes();
  }
}, [employeeId]);

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
      from: from,
      to: to,
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
  localStorage.removeItem("employee");
  localStorage.setItem("admin", "false");
  console.log(getEmployeeId())
  navigate("/login");
}
function handleAccount(id: string) {
  navigate(`/account/${id}`);
}
function handleViewDetails(id: number) {
  navigate(`/flight-details/${id}`);
}
function handlePassengerList(id: number) {
  navigate(`/passenger-list/${id}`);
}
async function handleAddFlight() {
  const token = localStorage.getItem("token");

  if (!token) {
    navigate("/login");
    return;
  }

  try {
    const response = await fetch("http://localhost:8000/add-flight", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        departure_airport: from,
        arrival_airport: to,
        departure_date: departureDate,
        departure_time: adminDepartureTime,
        duration_hours: Number(hours),
        duration_minutes: Number(minutes),
        plane_id: Number(planeId),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Failed to add flight");
    }

    alert("Flight successfully added!");

    // Clear the form
    setFrom("");
    setTo("");
    setDepartureDate("");
    setAdminDepartureTime("");
    setHours("");
    setMinutes("");
    setPlaneId("");

  } catch (error) {
    console.error("Error adding flight:", error);
    alert(error instanceof Error ? error.message : "Unable to add flight.");
  }
}

function handleSubmit(e: FormEvent<HTMLFormElement>) {
  if (admin) {
    e.preventDefault();
    handleAddFlight();
  } else {
    handleSearch(e);
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

            <Link to="/home" className="hover:text-[#5C339E]">
            Home
            </Link>

            <button
            type="button"
            onClick={() => { if(userId!=null) {handleAccount(String(userId))}}}
            className="hover:text-[#5C339E]"
            >
            My Account
            </button>

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
          onSubmit={handleSubmit} 
          className="flex flex-col items-start gap-2.5 w-full"
        >
        {/* First Row - Common Fields */}
        <div className="flex flex-wrap items-end gap-2 w-full">

          <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
            <span className="text-[#737373] font-inter text-[10px]">From</span>
            <input
              type="text"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
            />
          </label>

          <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
            <span className="text-[#737373] font-inter text-[10px]">To</span>
            <input
              type="text"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
            />
          </label>

          <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
            <span className="text-[#737373] font-inter text-[10px]">Departure date</span>
            <input
              type="date"
              required
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
            />
          </label>

        </div>
        {/* Second Row - Admin Fields */}
          {admin && (
            <div className="flex flex-wrap items-end gap-2 w-full">

              <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
                <span className="text-[#737373] font-inter text-[10px]">
                  Departure Time
                </span>
                <input
                  type="time"
                  required
                  value={adminDepartureTime}
                  onChange={(e) => setAdminDepartureTime(e.target.value)}
                  className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
                />
              </label>

              <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                <span className="text-[#737373] font-inter text-[10px]">
                  Flight Duration
                </span>

                <div className="flex gap-2">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-[#737373] font-inter text-[10px]">Hours</span>
                    <input
                      type="number"
                      required
                      value={hours}
                      min="0"
                      max="18"
                      placeholder="0"
                      onChange={(e) => {
                        const value = e.target.value;
                        setHours(value === "" ? "" : String(Math.min(18, Math.max(0, Number(value)))));
                      }}
                      className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
                    />
                  </label>

                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-[#737373] font-inter text-[10px]">Minutes</span>
                    <input
                      type="number"
                      required
                      value={minutes}
                      min="0"
                      max="59"
                      placeholder="0"
                      onChange={(e) => {
                        const value = e.target.value;
                        setMinutes(value === "" ? "" : String(Math.min(59, Math.max(0, Number(value)))));
                      }}
                      className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
                    />
                  </label>
                </div>
              </div>

              <label className="flex flex-col items-start gap-1 flex-1 min-w-[120px]">
                <span className="text-[#737373] font-inter text-[10px]">
                  Plane
                </span>
                <select
                  required
                  value={planeId}
                  onChange={(e) => setPlaneId(e.target.value)}
                  className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white w-full text-[#2E2E2E] font-inter text-[11px] outline-none focus:border-[#5C339E]"
                >
                  <option value="">Select a plane</option>
                  {planes.map((plane) => (
                    <option key={plane.id} value={plane.id}>
                      {plane.model} (ID: {plane.id})
                    </option>
                  ))}
                </select>
              </label>

            </div>
          )}
          {/* Filters */}
          {admin==false && <div className="flex flex-wrap items-center gap-1.5 w-full">

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
                <option>Standard</option>
                <option>Premium</option>

              </select>
            </label>

          </div>}

          {/* Search Button */}
          <button
            type="submit"
            className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D]"
          >
            {admin ? "Add Flight" : "Search Flights"}
          </button>

        </form>

       {/* Upcoming Flights */}
       
        {!searchSubmitted && admin==false&&(
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
                key={flight.flight_id ?? flight.id}
                flight={flight}
                type="upcoming"
                onAction={() => {if (flight.flight_id!=undefined) {
                    handleViewDetails(flight.flight_id)}}}
                onPassengerList={() => {if (flight.flight_id!=undefined) {
                    handlePassengerList(flight.flight_id)}}}
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
                  onAction={() => {if (flight.id!=undefined) {
                    handleViewDetails(flight.id)}
                  }}
                  onPassengerList={() =>{if (flight.id!=undefined) {
                    handlePassengerList(flight.id)}}}
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
