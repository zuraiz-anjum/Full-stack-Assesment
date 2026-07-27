from rest_framework import serializers

from .models import Trip


class TripCreateSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255)
    pickup_location = serializers.CharField(max_length=255)
    dropoff_location = serializers.CharField(max_length=255)
    current_cycle_used_hours = serializers.FloatField(min_value=0, max_value=70)

    # Optional — used to fill out the carrier/vehicle fields the FMCSA
    # daily log form requires but that aren't part of the trip-planning
    # inputs themselves. Left blank on the printed log if not provided.
    carrier_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    main_office_address = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    truck_number = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    trailer_number = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    driver_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    co_driver_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    shipping_doc_number = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


class TripListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_used_hours",
            "created_at",
        ]


class TripDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_used_hours",
            "result",
            "created_at",
            "share_token",
        ]


class SharedTripSerializer(serializers.ModelSerializer):
    """Same trip data as TripDetailSerializer, minus the token itself --
    whoever has the share link already has it, no reason to echo it back."""

    class Meta:
        model = Trip
        fields = [
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_used_hours",
            "result",
            "created_at",
        ]
