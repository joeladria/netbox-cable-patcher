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

    @patch('netbox_cable_patcher.api.views.CableSerializer')
    @patch('netbox_cable_patcher.api.views.CableTermination')
    @patch('netbox_cable_patcher.api.views.Cable')
    def test_create_cable_assigns_terminations_via_model_api(
        self, mock_cable_class, mock_termination_class, mock_serializer_class,
        request_factory, mock_user_with_perms,
    ):
        """
        Cable creation must assign a_terminations/b_terminations on the Cable
        instance (NetBox's own model API) rather than creating CableTermination
        rows directly. Only the former sets Cable._terminations_modified,
        which is what causes Cable.save() to create the CableTerminations,
        set the cable on the port objects, and fire the trace_paths signal
        that builds the CablePath used for cable tracing. Creating
        CableTermination rows manually silently skips path tracing.
        """
        import netbox_cable_patcher.api.views as views_module
        from netbox_cable_patcher.api.views import CablesViewSet

        mock_a_term = MagicMock(cable=None, id=1)
        mock_b_term = MagicMock(cable=None, id=2)

        mock_interface_model = MagicMock()
        mock_interface_model.objects.restrict.return_value.get.side_effect = [mock_a_term, mock_b_term]
        mock_interface_model.DoesNotExist = Exception

        mock_cable_instance = MagicMock()
        mock_cable_class.return_value = mock_cable_instance

        call_order = []
        mock_cable_instance.full_clean.side_effect = lambda: call_order.append('full_clean')
        mock_cable_instance.save.side_effect = lambda *a, **kw: call_order.append('save')

        mock_serializer_class.return_value.data = {'id': 1}

        request = request_factory.post('/api/cables/', {
            'a_termination_type': 'Interface',
            'a_termination_id': 1,
            'b_termination_type': 'Interface',
            'b_termination_id': 2,
        }, content_type='application/json')
        request.user = mock_user_with_perms

        with patch.dict(views_module.TERMINATION_MODELS, {'Interface': mock_interface_model}, clear=True):
            viewset = CablesViewSet()
            viewset.request = request
            response = viewset.create(request)

        assert response.status_code == drf_status.HTTP_201_CREATED, response.data

        # The Cable must be constructed with a_terminations/b_terminations,
        # not left to be set via separate CableTermination rows.
        _, kwargs = mock_cable_class.call_args
        assert kwargs.get('a_terminations') == [mock_a_term]
        assert kwargs.get('b_terminations') == [mock_b_term]

        # full_clean() must run before save() (validate-then-persist).
        assert call_order == ['full_clean', 'save']

        # CableTermination rows must never be created directly by this view;
        # Cable.save() is responsible for that.
        mock_termination_class.objects.create.assert_not_called()

        # The changelog entry for this Cable must be attributable to the
        # patcher, distinguishing it from changes made elsewhere in NetBox.
        assert kwargs.get('changelog_message') == views_module.CHANGELOG_MESSAGE

    @patch('netbox_cable_patcher.api.views.Cable')
    def test_delete_cable_with_permission(self, mock_cable_class, request_factory, mock_user_with_perms):
        """Test that cable deletion succeeds with proper permission."""
        from netbox_cable_patcher.api.views import CablesViewSet

        mock_cable = MagicMock()
        mock_cable_class.objects.restrict.return_value.get.return_value = mock_cable

        request = request_factory.delete('/api/cables/1/')
        request.user = mock_user_with_perms

        viewset = CablesViewSet()
        viewset.request = request
        response = viewset.destroy(request, pk=1)

        assert response.status_code == drf_status.HTTP_204_NO_CONTENT
        mock_cable.delete.assert_called_once()

    @patch('netbox_cable_patcher.api.views.Cable')
    def test_delete_cable_sets_changelog_message(self, mock_cable_class, request_factory, mock_user_with_perms):
        """Test that cable deletion records the patcher's changelog message."""
        import netbox_cable_patcher.api.views as views_module
        from netbox_cable_patcher.api.views import CablesViewSet

        mock_cable = MagicMock()
        mock_cable_class.objects.restrict.return_value.get.return_value = mock_cable

        request = request_factory.delete('/api/cables/1/')
        request.user = mock_user_with_perms

        viewset = CablesViewSet()
        viewset.request = request
        response = viewset.destroy(request, pk=1)

        assert response.status_code == drf_status.HTTP_204_NO_CONTENT
        assert mock_cable._changelog_message == views_module.CHANGELOG_MESSAGE
        mock_cable.delete.assert_called_once()

    @patch('netbox_cable_patcher.api.views.Cable')
    def test_delete_cable_not_found(self, mock_cable_class, request_factory, mock_user_with_perms):
        """Test that deleting non-existent cable returns 404."""
        from netbox_cable_patcher.api.views import CablesViewSet
        from dcim.models import Cable

        mock_cable_class.objects.restrict.return_value.get.side_effect = Cable.DoesNotExist
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


class TestDevicesViewSetMultiSelectFiltering:
    """Test multi-value rack/location filtering in DevicesViewSet.list."""

    @pytest.fixture
    def request_factory(self):
        return RequestFactory()

    def _mock_queryset(self, mock_device_class):
        """Wire up a mock Device queryset chain that records filter() calls
        and supports the prefetch/select_related chain used by the view."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.select_related.return_value = mock_qs
        mock_qs.prefetch_related.return_value = mock_qs
        mock_qs.order_by.return_value = []
        mock_device_class.objects.restrict.return_value = mock_qs
        return mock_qs

    def test_multiple_rack_ids_use_in_lookup(self, request_factory):
        """Multiple `rack` params should be combined into a single rack_id__in filter."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import DevicesViewSet

            mock_qs = self._mock_queryset(mock_device_class)

            request = request_factory.get('/api/devices/?rack=1&rack=2&rack=3')
            request.user = MagicMock()

            viewset = DevicesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 200
            mock_qs.filter.assert_called_with(rack_id__in=[1, 2, 3])

    def test_multiple_location_ids_use_in_lookup(self, request_factory):
        """Multiple `location` params should be combined into a location_id__in filter."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import DevicesViewSet

            mock_qs = self._mock_queryset(mock_device_class)

            request = request_factory.get('/api/devices/?location=5&location=6')
            request.user = MagicMock()

            viewset = DevicesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 200
            mock_qs.filter.assert_called_with(rack__location_id__in=[5, 6])

    def test_racks_take_precedence_over_locations(self, request_factory):
        """When both rack and location params are given, racks win."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import DevicesViewSet

            mock_qs = self._mock_queryset(mock_device_class)

            request = request_factory.get('/api/devices/?rack=1&location=5')
            request.user = MagicMock()

            viewset = DevicesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 200
            mock_qs.filter.assert_called_with(rack_id__in=[1])

    def test_invalid_rack_id_returns_400(self, request_factory):
        """Non-integer rack IDs should return a 400 error, not raise an exception."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import DevicesViewSet

            self._mock_queryset(mock_device_class)

            request = request_factory.get('/api/devices/?rack=not-a-number')
            request.user = MagicMock()

            viewset = DevicesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 400
            assert 'Invalid' in response.data.get('error', '')

    def test_no_filters_returns_400(self, request_factory):
        """No rack, location, or site should return a 400 error."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import DevicesViewSet

            self._mock_queryset(mock_device_class)

            request = request_factory.get('/api/devices/')
            request.user = MagicMock()

            viewset = DevicesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 400


class TestCablesViewSetMultiSelectFiltering:
    """Test multi-value rack/location filtering in CablesViewSet.list."""

    @pytest.fixture
    def request_factory(self):
        return RequestFactory()

    def test_multiple_rack_ids_resolve_devices(self, request_factory):
        """Multiple `rack` params should resolve devices via rack_id__in, then find no cables."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import CablesViewSet

            mock_qs = MagicMock()
            mock_qs.filter.return_value = mock_qs
            mock_qs.values_list.return_value = []  # no devices found
            mock_device_class.objects.restrict.return_value = mock_qs

            request = request_factory.get('/api/cables/?rack=1&rack=2')
            request.user = MagicMock()

            viewset = CablesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 200
            assert response.data == []
            mock_qs.filter.assert_called_with(rack_id__in=[1, 2])

    def test_multiple_location_ids_resolve_devices(self, request_factory):
        """Multiple `location` params should resolve devices via location_id__in."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import CablesViewSet

            mock_qs = MagicMock()
            mock_qs.filter.return_value = mock_qs
            mock_qs.values_list.return_value = []
            mock_device_class.objects.restrict.return_value = mock_qs

            request = request_factory.get('/api/cables/?location=7&location=8')
            request.user = MagicMock()

            viewset = CablesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 200
            mock_qs.filter.assert_called_with(rack__location_id__in=[7, 8])

    def test_invalid_rack_id_returns_400(self, request_factory):
        """Non-integer rack IDs should return a 400 error."""
        with patch('netbox_cable_patcher.api.views.Device') as mock_device_class:
            from netbox_cable_patcher.api.views import CablesViewSet

            mock_qs = MagicMock()
            mock_qs.filter.return_value = mock_qs
            mock_device_class.objects.restrict.return_value = mock_qs

            request = request_factory.get('/api/cables/?rack=bogus')
            request.user = MagicMock()

            viewset = CablesViewSet()
            viewset.request = request
            response = viewset.list(request)

            assert response.status_code == 400
            assert 'Invalid' in response.data.get('error', '')


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
