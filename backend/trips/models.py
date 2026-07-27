from django.db import models


class Trip(models.Model):
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_used_hours = models.FloatField()
    result = models.JSONField()
    # There's no user auth in this app -- every visitor would otherwise share
    # one global trip list. Each browser generates a random token (see
    # frontend's ownerToken.js) and only ever sees trips tagged with its own.
    owner_token = models.CharField(max_length=64, db_index=True, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.pickup_location} -> {self.dropoff_location} "
            f"({self.created_at:%Y-%m-%d %H:%M})"
        )
