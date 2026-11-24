import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUserId, getEmployeeId, getAdmin, isAdminEmployee } from "../utils/auth";

// REP-2 / REP-3: staff reports with Excel export

const API_URL = "http://localhost:8000";

type Tab = "popular-routes" | "frequent-cities";

interface RouteRow {
  rank: number;
  origin: string;
  origin_city: string;
  destination: string;
  dest_city: string;
  bookings: number;
  revenue_cents: number;
}

interface CityRow {
  rank: number;
  city: string;
  code: string;
  departures: number;
  arrivals: number;
  total_flights: number;
}

const TABS: { key: Tab; label: string; description: string; empty: string }[] = [
  {
    key: "popular-routes",
    label: "Popular Routes",
    description: "Routes ranked by confirmed bookings made in the period (booking date).",
    empty: "No bookings in this period.",
  },
  {
    key: "frequent-cities",
    label: "Frequent Cities",
    description: "Cities ranked by scheduled flights departing or arriving, for flights departing in the period.",
    empty: "No flights in this period.",
  },
];

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// yyyy-mm-dd in the browser's local time (for <input type="date">)
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

export default function Reports() {
  const navigate = useNavigate();
  const employeeId = getEmployeeId();
  const [admin, setAdmin] = useState(getAdmin());  
  const [tab, setTab] = useState<Tab>("popular-routes");
  // Same default as the backend: 90 days back to 90 days ahead
  const [start, setStart] = useState(daysFromToday(-90));
  const [end, setEnd] = useState(daysFromToday(90));
  const [rows, setRows] = useState<(RouteRow | CityRow)[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const current = TABS.find((t) => t.key === tab)!;

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("passenger");
    localStorage.removeItem("employee");
    localStorage.setItem("admin", "false");
    navigate("/login");
  }

  function reportUrl(format: "json" | "xlsx") {
    const params = new URLSearchParams({ start, end, limit: "10", format });
    return `${API_URL}/reports/${tab}?${params.toString()}`;
  }

  // Turns a failed response into a readable message
  async function errorText(res: Response) {
    const body = await res.json().catch(() => null);
    if (typeof body?.detail === "string") return body.detail;
    if (res.status === 422) return "Please enter valid start and end dates.";
    return "Unable to load the report. Please try again.";
  }

  const loadReport = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || employeeId === null) {
      navigate("/login");
      return;
    }
    if (start > end) {
      setError("Start date must be on or before the end date.");
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(reportUrl("json"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        setRows([]);
        setError(await errorText(res));
        return;
      }
      const data = await res.json();
      setRows(data.rows);
    } catch (err) {
      console.error("Error loading report:", err);
      setError("Unable to load the report. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tab, start, end, employeeId, navigate]);

  // Reload when the tab changes (dates reload when "Run report" is clicked)
  useEffect(() => {
    loadReport();
  }, [tab]);

  // A plain <a href> can't send the Authorization header, so: fetch the file
  // with the token -> turn it into a Blob -> click a temporary download link.
  async function handleExport() {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const res = await fetch(reportUrl("xlsx"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tab}_${start}_${end}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting report:", err);
      setError("Unable to export the report. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-start rounded-lg border border-[#D1C7EB] bg-white min-h-screen w-full overflow-hidden">
      {/* Navigation Header */}
      <div className="flex py-2.5 px-4 justify-between items-center bg-[#F2EDFC] w-full">
        <p className="text-[#2E2E2E] font-inter text-xs font-bold">Flight Reservation System</p>
        <nav className="flex gap-3 text-[#737373] font-inter text-[10px]">
          <Link to="/home" className="hover:text-[#5C339E]">
            Home
          </Link>
          <button type="button" onClick={handleLogout} className="hover:text-[#5C339E]">
            Log out
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex py-4 px-5 flex-col items-start gap-2.5 w-full">
        <h1 className="text-[#2E2E2E] font-inter text-lg font-bold">Reports</h1>

        {/* Tabs */}
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`cursor-pointer rounded px-3.5 py-[7px] font-inter text-[11px] font-bold ${
                tab === t.key
                  ? "bg-[#5C339E] text-white"
                  : "border border-[#D1C7EB] bg-white text-[#2E2E2E] hover:bg-[#F2EDFC]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-[#737373] font-inter text-[11px]">{current.description}</p>

        {/* Period + actions */}
        <form
          className="flex flex-wrap items-end gap-2.5 w-full"
          onSubmit={(e) => {
            e.preventDefault();
            loadReport();
          }}
        >
          <label className="flex flex-col gap-1 text-[#737373] font-inter text-[10px]">
            Start date
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white text-[#2E2E2E] text-[11px] outline-none focus:border-[#5C339E]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[#737373] font-inter text-[10px]">
            End date
            <input
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="py-[7px] px-2 rounded border border-[#D1C7EB] bg-white text-[#2E2E2E] text-[11px] outline-none focus:border-[#5C339E]"
            />
          </label>
          <button
            type="submit"
            className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded bg-[#5C339E] text-white font-inter text-[11px] font-bold hover:bg-[#48277D]"
          >
            Run report
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading || rows.length === 0}
            className="cursor-pointer flex py-[7px] px-3.5 justify-center items-center rounded border border-[#D1C7EB] bg-white text-[#2E2E2E] font-inter text-[11px] font-bold hover:bg-[#F2EDFC] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "Exporting..." : "Export to Excel"}
          </button>
        </form>

        {error && <p className="text-[#B3261E] font-inter text-[11px]">{error}</p>}

        {/* Ranked table */}
        <div className="w-full overflow-x-auto rounded-md border border-[#D1C7EB]">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              {tab === "popular-routes" ? (
                <tr className="bg-[#F2EDFC] text-[#2E2E2E] font-inter text-xs font-bold">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Route</th>
                  <th className="py-2.5 px-3">Cities</th>
                  <th className="py-2.5 px-3 text-right">Bookings</th>
                  <th className="py-2.5 px-3 text-right">Revenue</th>
                </tr>
              ) : (
                <tr className="bg-[#F2EDFC] text-[#2E2E2E] font-inter text-xs font-bold">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">City</th>
                  <th className="py-2.5 px-3">Airport</th>
                  <th className="py-2.5 px-3 text-right">Departures</th>
                  <th className="py-2.5 px-3 text-right">Arrivals</th>
                  <th className="py-2.5 px-3 text-right">Total flights</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 px-3 text-center text-[#737373] font-inter text-[11px]">
                    Loading report...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-3 text-center text-[#737373] font-inter text-[11px]">
                    {error ? "—" : current.empty}
                  </td>
                </tr>
              ) : tab === "popular-routes" ? (
                (rows as RouteRow[]).map((r) => (
                  <tr key={r.rank} className="border-t border-[#EEEEEE] text-[#444444] font-inter text-[11px]">
                    <td className="py-2.5 px-3 font-bold">{r.rank}</td>
                    <td className="py-2.5 px-3">
                      {r.origin} → {r.destination}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.origin_city} → {r.dest_city}
                    </td>
                    <td className="py-2.5 px-3 text-right">{r.bookings}</td>
                    <td className="py-2.5 px-3 text-right">{dollars(r.revenue_cents)}</td>
                  </tr>
                ))
              ) : (
                (rows as CityRow[]).map((r) => (
                  <tr key={r.rank} className="border-t border-[#EEEEEE] text-[#444444] font-inter text-[11px]">
                    <td className="py-2.5 px-3 font-bold">{r.rank}</td>
                    <td className="py-2.5 px-3">{r.city}</td>
                    <td className="py-2.5 px-3">{r.code}</td>
                    <td className="py-2.5 px-3 text-right">{r.departures}</td>
                    <td className="py-2.5 px-3 text-right">{r.arrivals}</td>
                    <td className="py-2.5 px-3 text-right">{r.total_flights}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[#737373] font-inter text-[10px]">Top 10 for the selected period.</p>
      </div>
    </div>
  );
}
