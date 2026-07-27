from django.urls import path

from .views import LocationAutocompleteView, TripDetailView, TripListCreateView

urlpatterns = [
    path("trips/", TripListCreateView.as_view(), name="trip-list-create"),
    path("trips/<int:pk>/", TripDetailView.as_view(), name="trip-detail"),
    path("locations/autocomplete/", LocationAutocompleteView.as_view(), name="location-autocomplete"),
]
