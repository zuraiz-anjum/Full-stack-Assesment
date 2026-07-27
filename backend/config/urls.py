from django.urls import include, path

# No admin URL: this app has no superuser and no operational need for the
# admin UI, so it's left unregistered rather than exposing an unused
# login form as a target. django.contrib.admin stays installed (some
# Django internals expect it), it's just never routed to.
urlpatterns = [
    path("api/", include("trips.urls")),
]
