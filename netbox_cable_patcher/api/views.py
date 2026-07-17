from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet
from netbox.api.authentication import IsAuthenticatedOrLoginNotRequired

from dcim.choices import LinkStatusChoices
from dcim.models import (
    Site, Location, Rack, Device, Interface,
    FrontPort, RearPort, PowerPort, PowerOutlet,
    ConsolePort, ConsoleServerPort, Cable, CableTermination,
    ModuleBay, Module, ModuleType
)

from .serializers import (
    SiteSerializer, LocationSerializer, RackSerializer,
    DeviceWithPortsSerializer, CableSerializer, CableCreateSerializer,
    ModuleTypeSearchSerializer, ModuleInstallSerializer, ModuleBaySerializer
)


TERMINATION_MODELS = {
    'Interface': Interface,
    'FrontPort': FrontPort,
    'RearPort': RearPort,
    'PowerPort': PowerPort,
    'PowerOutlet': PowerOutlet,
    'ConsolePort': ConsolePort,
    'ConsoleServerPort': ConsoleServerPort,
}


class LocationsViewSet(ViewSet):
    """API endpoint for getting location hierarchy."""
    permission_classes = [IsAuthenticatedOrLoginNotRequired]

    def list(self, request):
        """Get all sites with their locations and racks."""
        # Use prefetch_related to avoid N+1 queries.
        # restrict() enforces object-level permissions (incl. tenant restrictions).
        sites = Site.objects.restrict(request.user, 'view').prefetch_related(
            Prefetch(
                'locations',
                queryset=Location.objects.restrict(request.user, 'view').prefetch_related(
                    Prefetch('racks', queryset=Rack.objects.restrict(request.user, 'view').order_by('name'))
                ).order_by('name')
            ),
            Prefetch(
                'racks',
                queryset=Rack.objects.restrict(request.user, 'view').filter(location__isnull=True).order_by('name'),
                to_attr='site_level_racks'
            )
        ).order_by('name')

        result = []

        for site in sites:
            site_data = {
                'id': site.id,
                'name': site.name,
                'slug': site.slug,
                'locations': [],
                'racks': []
            }

            # Get locations for this site (already prefetched)
            for location in site.locations.all():
                location_data = {
                    'id': location.id,
                    'name': location.name,
                    'slug': location.slug,
                    'racks': []
                }
                # Get racks in this location (already prefetched)
                for rack in location.racks.all():
                    location_data['racks'].append({
                        'id': rack.id,
                        'name': rack.name
                    })
                site_data['locations'].append(location_data)

            # Get racks directly in site (no location) - using prefetched attribute
            for rack in site.site_level_racks:
                site_data['racks'].append({
                    'id': rack.id,
                    'name': rack.name
                })

            result.append(site_data)

        return Response(result)


class DevicesViewSet(ViewSet):
    """API endpoint for getting devices with their ports."""
    permission_classes = [IsAuthenticatedOrLoginNotRequired]

    def list(self, request):
        """Get devices filtered by location parameters."""
        rack_id = request.query_params.get('rack')
        location_id = request.query_params.get('location')
        site_id = request.query_params.get('site')

        devices = Device.objects.restrict(request.user, 'view')

        if rack_id:
            devices = devices.filter(rack_id=rack_id)
        elif location_id:
            devices = devices.filter(rack__location_id=location_id)
        elif site_id:
            devices = devices.filter(site_id=site_id)
        else:
            return Response({'error': 'Please specify rack, location, or site'}, status=400)

        devices = devices.select_related('device_type', 'rack').prefetch_related(
            Prefetch('interfaces', queryset=Interface.objects.select_related(
                'untagged_vlan', 'module'
            )),
            Prefetch('powerports', queryset=PowerPort.objects.select_related('module')),
            Prefetch('poweroutlets', queryset=PowerOutlet.objects.select_related('module')),
            Prefetch('frontports', queryset=FrontPort.objects.select_related('module')),
            Prefetch('rearports', queryset=RearPort.objects.select_related('module')),
            Prefetch('consoleports', queryset=ConsolePort.objects.select_related('module')),
            Prefetch('consoleserverports', queryset=ConsoleServerPort.objects.select_related('module')),
            Prefetch('modulebays', queryset=ModuleBay.objects.select_related(
                'installed_module__module_type__manufacturer'
            ).order_by('position', 'name')),
        ).order_by('name')

        serializer = DeviceWithPortsSerializer(devices, many=True)
        return Response(serializer.data)


class CablesViewSet(ViewSet):
    """API endpoint for managing cables."""
    permission_classes = [IsAuthenticatedOrLoginNotRequired]

    def list(self, request):
        """Get cables for devices in a location."""
        rack_id = request.query_params.get('rack')
        location_id = request.query_params.get('location')
        site_id = request.query_params.get('site')
        device_ids = request.query_params.getlist('device_ids[]')

        if device_ids:
            # Get cables connected to any of the specified devices.
            # Restrict to devices the user can view to prevent data leakage.
            try:
                device_id_ints = [int(d) for d in device_ids]
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid device ID. All device_ids must be integers.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            device_ids = list(
                Device.objects.restrict(request.user, 'view')
                .filter(id__in=device_id_ints)
                .values_list('id', flat=True)
            )
        elif rack_id:
            device_ids = list(Device.objects.restrict(request.user, 'view').filter(rack_id=rack_id).values_list('id', flat=True))
        elif location_id:
            device_ids = list(Device.objects.restrict(request.user, 'view').filter(rack__location_id=location_id).values_list('id', flat=True))
        elif site_id:
            device_ids = list(Device.objects.restrict(request.user, 'view').filter(site_id=site_id).values_list('id', flat=True))
        else:
            return Response({'error': 'Please specify rack, location, site, or device_ids'}, status=400)

        if not device_ids:
            return Response([])

        # Get all cables where any termination belongs to these devices
        cables = set()

        # Check all termination types
        for model_name, model in TERMINATION_MODELS.items():
            ct = ContentType.objects.get_for_model(model)
            # Get terminations belonging to our devices (restrict enforces
            # object-level permissions on the termination objects themselves).
            termination_ids = list(model.objects.restrict(request.user, 'view').filter(
                device_id__in=device_ids
            ).values_list('id', flat=True))

            if termination_ids:
                # Find cables with these terminations
                cable_ids = CableTermination.objects.filter(
                    termination_type=ct,
                    termination_id__in=termination_ids
                ).values_list('cable_id', flat=True)
                cables.update(cable_ids)

        cable_objects = Cable.objects.restrict(request.user, 'view').filter(id__in=cables).prefetch_related(
            'terminations'
        )

        serializer = CableSerializer(cable_objects, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new cable connection."""
        # Check permission
        if not request.user.has_perm('dcim.add_cable'):
            return Response(
                {'error': 'Permission denied. You do not have permission to create cables.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = CableCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # Get termination objects
        a_model = TERMINATION_MODELS.get(data['a_termination_type'])
        b_model = TERMINATION_MODELS.get(data['b_termination_type'])

        if not a_model or not b_model:
            return Response(
                {'error': 'Invalid termination type'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            a_term = a_model.objects.restrict(request.user, 'view').get(id=data['a_termination_id'])
            b_term = b_model.objects.restrict(request.user, 'view').get(id=data['b_termination_id'])
        except (a_model.DoesNotExist, b_model.DoesNotExist):
            return Response(
                {'error': 'Termination not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if either port is already connected
        if a_term.cable or b_term.cable:
            return Response(
                {'error': 'One or both ports are already connected.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # Create the cable
                cable = Cable(
                    type=data.get('type', ''),
                    status=data.get('status', LinkStatusChoices.STATUS_CONNECTED),
                    color=data.get('color', ''),
                    label=data.get('label', ''),
                )
                cable.save()

                # Create terminations
                a_ct = ContentType.objects.get_for_model(a_model)
                b_ct = ContentType.objects.get_for_model(b_model)

                CableTermination.objects.create(
                    cable=cable,
                    cable_end='A',
                    termination_type=a_ct,
                    termination_id=a_term.id
                )
                CableTermination.objects.create(
                    cable=cable,
                    cable_end='B',
                    termination_type=b_ct,
                    termination_id=b_term.id
                )

                # Refresh so the cable instance knows about its terminations,
                # then run NetBox's own model-level validation (compatibility
                # checks, same-device restrictions, etc.).
                cable.refresh_from_db()
                cable.full_clean()

                # Verify object-level permission constraints (e.g. "user may
                # only add cables in site X").  The model-level has_perm()
                # check above does not evaluate these constraints.
                if not request.user.has_perm('dcim.add_cable', obj=cable):
                    raise PermissionError()

        except PermissionError:
            return Response(
                {'error': 'Permission denied. You do not have permission to create this cable.'},
                status=status.HTTP_403_FORBIDDEN
            )
        except DjangoValidationError as exc:
            # Flatten the error messages from Django's ValidationError
            messages = []
            if hasattr(exc, 'message_dict'):
                for field, errs in exc.message_dict.items():
                    messages.extend(errs)
            else:
                messages = list(exc.messages)
            return Response(
                {'error': ' '.join(messages)},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(CableSerializer(cable).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        """Delete a cable."""
        # Check permission
        if not request.user.has_perm('dcim.delete_cable'):
            return Response(
                {'error': 'Permission denied. You do not have permission to delete cables.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            cable = Cable.objects.restrict(request.user, 'delete').get(pk=pk)
        except Cable.DoesNotExist:
            return Response(
                {'error': 'Cable not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        cable.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModuleTypesViewSet(ViewSet):
    """API endpoint for searching module types."""
    permission_classes = [IsAuthenticatedOrLoginNotRequired]

    def list(self, request):
        """Search module types by query string."""
        q = request.query_params.get('q', '').strip()
        if not q:
            return Response([])

        qs = ModuleType.objects.select_related('manufacturer').filter(
            model__icontains=q
        ).order_by('manufacturer__name', 'model')[:50]

        serializer = ModuleTypeSearchSerializer(qs, many=True)
        return Response(serializer.data)


class ModuleBaysViewSet(ViewSet):
    """API endpoint for module bay operations (install/uninstall modules)."""
    permission_classes = [IsAuthenticatedOrLoginNotRequired]

    @action(detail=True, methods=['post'])
    def install(self, request, pk=None):
        """Install a module into a module bay."""
        if not request.user.has_perm('dcim.add_module'):
            return Response(
                {'error': 'Permission denied. You do not have permission to install modules.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            module_bay = ModuleBay.objects.select_related(
                'installed_module', 'device'
            ).get(pk=pk)
        except ModuleBay.DoesNotExist:
            return Response(
                {'error': 'Module bay not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check user can view the parent device
        if not Device.objects.restrict(request.user, 'view').filter(pk=module_bay.device_id).exists():
            return Response(
                {'error': 'Module bay not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if hasattr(module_bay, 'installed_module') and module_bay.installed_module:
            return Response(
                {'error': 'This module bay already has a module installed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ModuleInstallSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            module_type = ModuleType.objects.get(pk=data['module_type_id'])
        except ModuleType.DoesNotExist:
            return Response(
                {'error': 'Module type not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            with transaction.atomic():
                module = Module(
                    device=module_bay.device,
                    module_bay=module_bay,
                    module_type=module_type,
                    status='active',
                    serial=data.get('serial', ''),
                    asset_tag=data.get('asset_tag') or None,
                )
                module.full_clean()
                module.save()
        except DjangoValidationError as exc:
            messages = []
            if hasattr(exc, 'message_dict'):
                for field, errs in exc.message_dict.items():
                    messages.extend(errs)
            else:
                messages = list(exc.messages)
            return Response(
                {'error': ' '.join(messages)},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Re-fetch the module bay with the installed module for response
        module_bay.refresh_from_db()
        module_bay = ModuleBay.objects.select_related(
            'installed_module__module_type__manufacturer'
        ).get(pk=pk)

        return Response(
            ModuleBaySerializer(module_bay).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def uninstall(self, request, pk=None):
        """Remove a module from a module bay."""
        if not request.user.has_perm('dcim.delete_module'):
            return Response(
                {'error': 'Permission denied. You do not have permission to remove modules.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            module_bay = ModuleBay.objects.select_related(
                'installed_module', 'device'
            ).get(pk=pk)
        except ModuleBay.DoesNotExist:
            return Response(
                {'error': 'Module bay not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check user can view the parent device
        if not Device.objects.restrict(request.user, 'view').filter(pk=module_bay.device_id).exists():
            return Response(
                {'error': 'Module bay not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not hasattr(module_bay, 'installed_module') or not module_bay.installed_module:
            return Response(
                {'error': 'No module installed in this bay.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        module_bay.installed_module.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
