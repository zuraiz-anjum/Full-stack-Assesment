import logging

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Trip
from .serializers import (
    SharedTripSerializer,
    TripCreateSerializer,
    TripDetailSerializer,
    TripListSerializer,
)
from .services import routing
from .services.hos_engine import TripTooLongError
from .services.pdf_builder import build_trip_pdf
from .services.routing import RoutingError
from .services.trip_planner import plan_trip

logger = logging.getLogger(__name__)


class LocationAutocompleteView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "autocomplete"

    def get(self, request):
        query = request.query_params.get("q", "")
        try:
            places = routing.autocomplete(query)
        except RoutingError:
            places = []
        return Response(
            [{"label": p.label, "lat": p.lat, "lon": p.lon} for p in places]
        )


def _owner_token(request) -> str:
    return request.META.get("HTTP_X_OWNER_TOKEN", "")[:64]


class TripListCreateView(generics.ListAPIView):
    """GET: recent trip history. POST: plan a new trip and persist the result."""

    serializer_class = TripListSerializer

    def get_queryset(self):
        # No auth in this app -- scope every read to the requesting browser's
        # own anonymous token instead of exposing every visitor's trips
        # (locations, vehicle/driver info) to anyone who calls this endpoint.
        return Trip.objects.filter(owner_token=_owner_token(self.request))[:20]

    def get_throttles(self):
        # Only the expensive path (POST, which burns several OpenRouteService
        # calls per request) is rate-limited — browsing history stays free.
        if self.request.method == "POST":
            self.throttle_scope = "trip-create"
            return [ScopedRateThrottle()]
        return []

    VEHICLE_INFO_FIELDS = [
        "carrier_name",
        "main_office_address",
        "truck_number",
        "trailer_number",
        "driver_name",
        "co_driver_name",
        "shipping_doc_number",
    ]

    def post(self, request, *args, **kwargs):
        input_serializer = TripCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        try:
            result = plan_trip(
                current_location_text=data["current_location"],
                pickup_location_text=data["pickup_location"],
                dropoff_location_text=data["dropoff_location"],
                current_cycle_used_hours=data["current_cycle_used_hours"],
                vehicle_info={field: data[field] for field in self.VEHICLE_INFO_FIELDS},
            )
        except RoutingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except TripTooLongError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except Exception:
            logger.exception("Unexpected error while planning trip")
            return Response(
                {"detail": "Something went wrong while planning this trip. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        trip = Trip.objects.create(
            current_location=data["current_location"],
            pickup_location=data["pickup_location"],
            dropoff_location=data["dropoff_location"],
            current_cycle_used_hours=data["current_cycle_used_hours"],
            result=result,
            owner_token=_owner_token(request),
        )
        return Response(TripDetailSerializer(trip).data, status=status.HTTP_201_CREATED)


class TripDetailView(generics.RetrieveAPIView):
    serializer_class = TripDetailSerializer

    def get_queryset(self):
        # Same owner-token scoping as the list view -- without it, trip IDs
        # are sequential and guessable, so anyone could page through
        # /api/trips/1/, /2/, /3/... and read every other visitor's route
        # and vehicle/driver info.
        return Trip.objects.filter(owner_token=_owner_token(self.request))


def _pdf_response(trip: Trip) -> HttpResponse:
    pdf_bytes = build_trip_pdf(trip.result)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="trip-{trip.id}-daily-logs.pdf"'
    return response


class TripPdfView(generics.RetrieveAPIView):
    """Streams the trip's daily logs as a real PDF (one page per day),
    laid out like the FMCSA paper form -- an alternative to relying on
    the browser's print dialog, which varies by browser/OS."""

    def get_queryset(self):
        return Trip.objects.filter(owner_token=_owner_token(self.request))

    def get(self, request, *args, **kwargs):
        return _pdf_response(self.get_object())


class SharedTripDetailView(generics.RetrieveAPIView):
    """Public, read-only lookup by share_token -- deliberately NOT scoped to
    an owner token. Knowing the (unguessable, random) token is what grants
    access, same trust model as the owner token, just meant to be handed to
    someone else on purpose (e.g. a dispatcher)."""

    queryset = Trip.objects.all()
    serializer_class = SharedTripSerializer
    lookup_field = "share_token"


class SharedTripPdfView(generics.RetrieveAPIView):
    queryset = Trip.objects.all()
    lookup_field = "share_token"

    def get(self, request, *args, **kwargs):
        return _pdf_response(self.get_object())
