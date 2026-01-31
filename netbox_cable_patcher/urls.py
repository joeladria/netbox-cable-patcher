from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.CablePatcherView.as_view(), name='patcher'),
    path('api/', include('netbox_cable_patcher.api.urls')),
]
