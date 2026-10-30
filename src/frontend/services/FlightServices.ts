const API_URL = "http://localhost:8000";

export async function getUpcomingFlights(token: string) {
  const response = await fetch(`${API_URL}/flights/upcoming`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load upcoming flights");
  }

  return response.json();
}

export async function searchFlights(
  token: string,
  searchParams: {
    origin: string;
    destination: string;
    departure_date: string;
    return_date?: string;
    passengers: number;
  }
) {
  const query = new URLSearchParams({
    origin: searchParams.origin,
    destination: searchParams.destination,
    departure_date: searchParams.departure_date,
    passengers: String(searchParams.passengers),
  });

  if (searchParams.return_date) {
    query.append("return_date", searchParams.return_date);
  }

  const response = await fetch(
    `${API_URL}/flights/search?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to search flights");
  }

  return response.json();
}