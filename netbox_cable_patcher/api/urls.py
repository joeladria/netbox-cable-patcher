from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('locations', views.LocationsViewSet, basename='locations')
router.register('devices', views.DevicesViewSet, basename='devices')
router.register('cables', views.CablesViewSet, basename='cables')

urlpatterns = router.urls
