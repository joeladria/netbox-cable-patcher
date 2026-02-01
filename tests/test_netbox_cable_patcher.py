#!/usr/bin/env python
"""Tests for `netbox_cable_patcher` package."""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from django.test import RequestFactory
from rest_framework import status as drf_status


class TestCablePatcherPermissions:
    """Test permission enforcement in the Cable Patcher plugin."""

    @pytest.fixture
    def request_factory(self):
        return RequestFactory()

    @pytest.fixture
    def mock_user_with_perms(self):
        """Create a mock user with cable permissions."""
        user = MagicMock()
        user.is_authenticated = True
        user.has_perm = MagicMock(return_value=True)
        return user

    @pytest.fixture
    def mock_user_without_perms(self):
        """Create a mock user without cable permissions."""
        user = MagicMock()
        user.is_authenticated = True
        user.has_perm = MagicMock(return_value=False)
        return user

    def test_create_cable_requires_permission(self, request_factory, mock_user_without_perms):
        """Test that cable creation requires dcim.add_cable permission."""
        from netbox_cable_patcher.api.views import CablesViewSet

        request = request_factory.post('/api/cables/', {
            'a_termination_type': 'Interface',
            'a_termination_id': 1,
            'b_termination_type': 'Interface',
            'b_termination_id': 2,
        }, content_type='application/json')
        request.user = mock_user_without_perms

        viewset = CablesViewSet()
        viewset.request = request
        response = viewset.create(request)

        assert response.status_code == drf_status.HTTP_403_FORBIDDEN
        assert 'Permission denied' in response.data.get('error', '')
        mock_user_without_perms.has_perm.assert_called_with('dcim.add_cable')

    def test_delete_cable_requires_permission(self, request_factory, mock_user_without_perms):
        """Test that cable deletion requires dcim.delete_cable permission."""
        from netbox_cable_patcher.api.views import CablesViewSet

        request = request_factory.delete('/api/cables/1/')
        request.user = mock_user_without_perms

        viewset = CablesViewSet()
        viewset.request = request
        response = viewset.destroy(request, pk=1)

        assert response.status_code == drf_status.HTTP_403_FORBIDDEN
        assert 'Permission denied' in response.data.get('error', '')
        mock_user_without_perms.has_perm.assert_called_with('dcim.delete_cable')

    @patch('netbox_cable_patcher.api.views.Cable')
    def test_delete_cable_with_permission(self, mock_cable_class, request_factory, mock_user_with_perms):
        """Test that cable deletion succeeds with proper permission."""
        from netbox_cable_patcher.api.views import CablesViewSet

        mock_cable = MagicMock()
        mock_cable_class.objects.get.return_value = mock_cable

        request = request_factory.delete('/api/cables/1/')
        request.user = mock_user_with_perms

        viewset = CablesViewSet()
        viewset.request = request
        response = viewset.destroy(request, pk=1)

        assert response.status_code == drf_status.HTTP_204_NO_CONTENT
        mock_cable.delete.assert_called_once()

    @patch('netbox_cable_patcher.api.views.Cable')
    def test_delete_cable_not_found(self, mock_cable_class, request_factory, mock_user_with_perms):
        """Test that deleting non-existent cable returns 404."""
        from netbox_cable_patcher.api.views import CablesViewSet
        from dcim.models import Cable

        mock_cable_class.objects.get.side_effect = Cable.DoesNotExist
        mock_cable_class.DoesNotExist = Cable.DoesNotExist

        request = request_factory.delete('/api/cables/999/')
        request.user = mock_user_with_perms

        viewset = CablesViewSet()
        viewset.request = request
        response = viewset.destroy(request, pk=999)

        assert response.status_code == drf_status.HTTP_404_NOT_FOUND


class TestCablePatcherView:
    """Test the main Cable Patcher view."""

    def test_view_requires_login(self):
        """Test that the view requires authentication."""
        from netbox_cable_patcher.views import CablePatcherView
        from django.contrib.auth.mixins import LoginRequiredMixin

        assert issubclass(CablePatcherView, LoginRequiredMixin)

    def test_view_requires_view_cable_permission(self):
        """Test that the view requires dcim.view_cable permission."""
        from netbox_cable_patcher.views import CablePatcherView
        from django.contrib.auth.mixins import PermissionRequiredMixin

        assert issubclass(CablePatcherView, PermissionRequiredMixin)
        assert CablePatcherView.permission_required == 'dcim.view_cable'


class TestCableSerializer:
    """Test the cable serializers."""

    def test_cable_create_serializer_validates_termination_types(self):
        """Test that CableCreateSerializer validates termination types."""
        from netbox_cable_patcher.api.serializers import CableCreateSerializer

        # Valid data
        valid_data = {
            'a_termination_type': 'Interface',
            'a_termination_id': 1,
            'b_termination_type': 'Interface',
            'b_termination_id': 2,
        }
        serializer = CableCreateSerializer(data=valid_data)
        assert serializer.is_valid(), serializer.errors

    def test_cable_create_serializer_requires_termination_ids(self):
        """Test that CableCreateSerializer requires termination IDs."""
        from netbox_cable_patcher.api.serializers import CableCreateSerializer

        # Missing termination IDs
        invalid_data = {
            'a_termination_type': 'Interface',
            'b_termination_type': 'Interface',
        }
        serializer = CableCreateSerializer(data=invalid_data)
        assert not serializer.is_valid()
        assert 'a_termination_id' in serializer.errors
        assert 'b_termination_id' in serializer.errors


class TestLocationsViewSet:
    """Test the locations API endpoint."""

    @pytest.fixture
    def request_factory(self):
        return RequestFactory()

    @patch('netbox_cable_patcher.api.views.Site')
    def test_list_locations_returns_sites_with_prefetch(self, mock_site_class, request_factory):
        """Test that list() uses prefetch_related for efficiency."""
        from netbox_cable_patcher.api.views import LocationsViewSet

        # Create mock site
        mock_site = MagicMock()
        mock_site.id = 1
        mock_site.name = 'Test Site'
        mock_site.slug = 'test-site'
        mock_site.locations.all.return_value = []
        mock_site.site_level_racks = []

        # Set up the mock queryset
        mock_queryset = MagicMock()
        mock_queryset.prefetch_related.return_value = mock_queryset
        mock_queryset.order_by.return_value = [mock_site]
        mock_site_class.objects.prefetch_related.return_value = mock_queryset

        request = request_factory.get('/api/locations/')
        request.user = MagicMock()
        request.user.is_authenticated = True

        viewset = LocationsViewSet()
        viewset.request = request
        response = viewset.list(request)

        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]['name'] == 'Test Site'


class TestCableStatusConstants:
    """Test that the plugin uses NetBox constants correctly."""

    def test_uses_cable_status_choices(self):
        """Test that the create method uses CableStatusChoices constant."""
        from netbox_cable_patcher.api import views
        import inspect

        source = inspect.getsource(views.CablesViewSet.create)
        assert 'CableStatusChoices.STATUS_CONNECTED' in source


class TestPluginConfiguration:
    """Test plugin configuration and packaging."""

    def test_plugin_config_exists(self):
        """Test that PluginConfig is properly defined."""
        from netbox_cable_patcher import CablePatcherConfig

        assert CablePatcherConfig.name == 'netbox_cable_patcher'
        assert hasattr(CablePatcherConfig, 'verbose_name')

    def test_navigation_requires_permission(self):
        """Test that navigation menu requires dcim.view_cable permission."""
        from netbox_cable_patcher.navigation import menu_items

        # Navigation items should require view_cable permission
        for item in menu_items:
            assert 'dcim.view_cable' in item.permissions


class TestXSSPrevention:
    """Test XSS prevention measures."""

    def test_template_uses_escapejs(self):
        """Test that the template uses escapejs filter for JavaScript variables."""
        import os

        template_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'netbox_cable_patcher',
            'templates',
            'netbox_cable_patcher',
            'patcher.html'
        )

        with open(template_path, 'r') as f:
            content = f.read()

        # Check that selected_site uses escapejs filter
        assert 'selected_site|escapejs' in content
