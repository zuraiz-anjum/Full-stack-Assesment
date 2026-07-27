from django.urls import path

from .views import LocationAutocompleteView, TripDetailView, TripListCreateView, TripPdfView

urlpatterns = [
    path("trips/", TripListCreateView.as_view(), name="trip-list-create"),
    path("trips/<int:pk>/", TripDetailView.as_view(), name="trip-detail"),
    path("trips/<int:pk>/pdf/", TripPdfView.as_view(), name="trip-pdf"),
    path("locations/autocomplete/", LocationAutocompleteView.as_view(), name="location-autocomplete"),
]
