import os
from dotenv import load_dotenv
from supabase import create_client

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# lets React talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/flights/{flight_id}")
def get_flight(flight_id: int):
    return {"flight_id": flight_id}


# your normal Python function
def add(a, b):
    return a + b

# the URL that runs it
@app.get("/add")
def add_route(a: int, b: int):
    return {"result": add(a, b)}