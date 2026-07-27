import axios from "axios";
import { getOwnerToken } from "./ownerToken";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

const client = axios.create({ baseURL: BASE_URL, timeout: 30000 });

client.interceptors.request.use((config) => {
  config.headers["X-Owner-Token"] = getOwnerToken();
  return config;
});

export async function planTrip({
  currentLocation,
  pickupLocation,
  dropoffLocation,
  currentCycleUsedHours,
  carrierName,
  mainOfficeAddress,
  truckNumber,
  trailerNumber,
  driverName,
  coDriverName,
  shippingDocNumber,
}) {
  const { data } = await client.post("/trips/", {
    current_location: currentLocation,
    pickup_location: pickupLocation,
    dropoff_location: dropoffLocation,
    current_cycle_used_hours: currentCycleUsedHours,
    carrier_name: carrierName,
    main_office_address: mainOfficeAddress,
    truck_number: truckNumber,
    trailer_number: trailerNumber,
    driver_name: driverName,
    co_driver_name: coDriverName,
    shipping_doc_number: shippingDocNumber,
  });
  return data;
}

export async function listTrips() {
  const { data } = await client.get("/trips/");
  return data;
}

export async function getTrip(id) {
  const { data } = await client.get(`/trips/${id}/`);
  return data;
}

export async function autocompleteLocation(query) {
  if (!query || query.trim().length < 2) return [];
  const { data } = await client.get("/locations/autocomplete/", { params: { q: query } });
  return data;
}

export function extractErrorMessage(error) {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.[Object.keys(error?.response?.data || {})[0]]?.[0] ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}
