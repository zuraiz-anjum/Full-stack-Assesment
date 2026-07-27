import logging

from rest_framework import generics, status
from rest_framework.response import Response

from .models import Trip
from .serializers import TripCreateSerializer, TripDetailSerializer, TripListSerializer
from .services.hos_engine import TripTooLongError
from .services.routing import RoutingError
from .services.trip_planner import plan_trip

logger = logging.getLogger(__name__)


class TripListCreateView(generics.ListAPIView):
    """GET: recent trip history. POST: plan a new trip and persist the result."""

    queryset = Trip.objects.all()[:20]
    serializer_class = TripListSerializer

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
        )
        return Response(TripDetailSerializer(trip).data, status=status.HTTP_201_CREATED)


class TripDetailView(generics.RetrieveAPIView):
    queryset = Trip.objects.all()
    serializer_class = TripDetailSerializer
