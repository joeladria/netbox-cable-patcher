from rest_framework import serializers
from dcim.models import (
    Site, Location, Rack, Device, Interface,
    FrontPort, RearPort, PowerPort, PowerOutlet,
    ConsolePort, ConsoleServerPort, Cable
)


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ['id', 'name', 'slug']


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name', 'slug', 'site']


class RackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rack
        fields = ['id', 'name', 'site', 'location']


class PortSerializer(serializers.Serializer):
    """Generic serializer for any port type."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    type = serializers.CharField(source='get_type_display', required=False, allow_null=True)
    cable_id = serializers.SerializerMethodField()
    connected_endpoint = serializers.SerializerMethodField()
    port_type = serializers.SerializerMethodField()

    def get_cable_id(self, obj):
        if hasattr(obj, 'cable') and obj.cable:
            return obj.cable.id
        return None

    def get_connected_endpoint(self, obj):
        if hasattr(obj, 'connected_endpoints') and obj.connected_endpoints:
            endpoints = obj.connected_endpoints
            if endpoints:
                endpoint = endpoints[0]
                return {
                    'id': endpoint.id,
                    'name': endpoint.name if hasattr(endpoint, 'name') else str(endpoint),
                    'device_id': endpoint.device.id if hasattr(endpoint, 'device') else None,
                    'device_name': endpoint.device.name if hasattr(endpoint, 'device') else None,
                    'type': endpoint.__class__.__name__
                }
        return None

    def get_port_type(self, obj):
        return obj.__class__.__name__


class DeviceWithPortsSerializer(serializers.ModelSerializer):
    interfaces = serializers.SerializerMethodField()
    power_ports = serializers.SerializerMethodField()
    power_outlets = serializers.SerializerMethodField()
    front_ports = serializers.SerializerMethodField()
    rear_ports = serializers.SerializerMethodField()
    console_ports = serializers.SerializerMethodField()
    console_server_ports = serializers.SerializerMethodField()

    class Meta:
        model = Device
        fields = [
            'id', 'name', 'device_type', 'rack', 'position',
            'interfaces', 'power_ports', 'power_outlets',
            'front_ports', 'rear_ports', 'console_ports', 'console_server_ports'
        ]

    def get_interfaces(self, obj):
        return PortSerializer(obj.interfaces.all(), many=True).data

    def get_power_ports(self, obj):
        return PortSerializer(obj.powerports.all(), many=True).data

    def get_power_outlets(self, obj):
        return PortSerializer(obj.poweroutlets.all(), many=True).data

    def get_front_ports(self, obj):
        return PortSerializer(obj.frontports.all(), many=True).data

    def get_rear_ports(self, obj):
        return PortSerializer(obj.rearports.all(), many=True).data

    def get_console_ports(self, obj):
        return PortSerializer(obj.consoleports.all(), many=True).data

    def get_console_server_ports(self, obj):
        return PortSerializer(obj.consoleserverports.all(), many=True).data


class CableSerializer(serializers.ModelSerializer):
    a_terminations = serializers.SerializerMethodField()
    b_terminations = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model = Cable
        fields = [
            'id', 'type', 'type_display', 'status', 'status_display',
            'color', 'label', 'length', 'length_unit',
            'a_terminations', 'b_terminations'
        ]

    def get_a_terminations(self, obj):
        return self._serialize_terminations(obj.a_terminations)

    def get_b_terminations(self, obj):
        return self._serialize_terminations(obj.b_terminations)

    def _serialize_terminations(self, terminations):
        result = []
        for term in terminations:
            data = {
                'id': term.id,
                'name': term.name if hasattr(term, 'name') else str(term),
                'type': term.__class__.__name__,
            }
            if hasattr(term, 'device'):
                data['device_id'] = term.device.id
                data['device_name'] = term.device.name
            result.append(data)
        return result


class CableCreateSerializer(serializers.Serializer):
    """Serializer for creating cables via the patcher interface."""
    a_termination_type = serializers.CharField()
    a_termination_id = serializers.IntegerField()
    b_termination_type = serializers.CharField()
    b_termination_id = serializers.IntegerField()
    type = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(default='connected')
    color = serializers.CharField(required=False, allow_blank=True)
    label = serializers.CharField(required=False, allow_blank=True)
