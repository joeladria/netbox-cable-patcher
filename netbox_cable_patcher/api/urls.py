from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('locations', views.LocationsViewSet, basename='locations')
router.register('devices', views.DevicesViewSet, basename='devices')
router.register('cables', views.CablesViewSet, basename='cables')
router.register('module-types', views.ModuleTypesViewSet, basename='module-types')
router.register('module-bays', views.ModuleBaysViewSet, basename='module-bays')

urlpatterns = router.urls
