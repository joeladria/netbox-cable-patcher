from django.contrib.contenttypes.models import ContentType
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
    ConsolePort, ConsoleServerPort, Cable, CableTermination
)

from .serializers import (
    SiteSerializer, LocationSerializer, RackSerializer,
    DeviceWithPortsSerializer, CableSerializer, CableCreateSerializer
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
        # Use prefetch_related to avoid N+1 queries
        sites = Site.objects.prefetch_related(
            Prefetch(
                'locations',
                queryset=Location.objects.prefetch_related(
                    Prefetch('racks', queryset=Rack.objects.order_by('name'))
                ).order_by('name')
            ),
            Prefetch(
                'racks',
                queryset=Rack.objects.filter(location__isnull=True).order_by('name'),
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

        devices = Device.objects.all()

        if rack_id:
            devices = devices.filter(rack_id=rack_id)
        elif location_id:
            devices = devices.filter(rack__location_id=location_id)
        elif site_id:
            devices = devices.filter(site_id=site_id)
        else:
            return Response({'error': 'Please specify rack, location, or site'}, status=400)

        devices = devices.select_related('device_type', 'rack').prefetch_related(
            'interfaces',
            'powerports',
            'poweroutlets',
            'frontports',
            'rearports',
            'consoleports',
            'consoleserverports',
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
            # Get cables connected to any of the specified devices
            device_ids = [int(d) for d in device_ids]
        elif rack_id:
            device_ids = list(Device.objects.filter(rack_id=rack_id).values_list('id', flat=True))
        elif location_id:
            device_ids = list(Device.objects.filter(rack__location_id=location_id).values_list('id', flat=True))
        elif site_id:
            device_ids = list(Device.objects.filter(site_id=site_id).values_list('id', flat=True))
        else:
            return Response({'error': 'Please specify rack, location, site, or device_ids'}, status=400)

        if not device_ids:
            return Response([])

        # Get all cables where any termination belongs to these devices
        cables = set()

        # Check all termination types
        for model_name, model in TERMINATION_MODELS.items():
            ct = ContentType.objects.get_for_model(model)
            # Get terminations belonging to our devices
            termination_ids = list(model.objects.filter(
                device_id__in=device_ids
            ).values_list('id', flat=True))

            if termination_ids:
                # Find cables with these terminations
                cable_ids = CableTermination.objects.filter(
                    termination_type=ct,
                    termination_id__in=termination_ids
                ).values_list('cable_id', flat=True)
                cables.update(cable_ids)

        cable_objects = Cable.objects.filter(id__in=cables).prefetch_related(
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
            a_term = a_model.objects.get(id=data['a_termination_id'])
            b_term = b_model.objects.get(id=data['b_termination_id'])
        except (a_model.DoesNotExist, b_model.DoesNotExist):
            return Response(
                {'error': 'Termination not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if either port is already connected
        if a_term.cable:
            return Response(
                {'error': f'{a_term.name} is already connected'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if b_term.cable:
            return Response(
                {'error': f'{b_term.name} is already connected'},
                status=status.HTTP_400_BAD_REQUEST
            )

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

        # Refresh to get the terminations
        cable.refresh_from_db()

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
            cable = Cable.objects.get(pk=pk)
        except Cable.DoesNotExist:
            return Response(
                {'error': 'Cable not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        cable.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
