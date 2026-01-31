"""Top-level package for NetBox Cable Patcher."""

__author__ = """John Doe"""
__email__ = ""
__version__ = "0.1.0"


from netbox.plugins import PluginConfig


class NetBoxCablePatcherConfig(PluginConfig):
    name = "netbox_cable_patcher"
    verbose_name = "Cable Patcher"
    description = "Visual patch bay interface for NetBox with interactive cable connections."
    version = __version__
    base_url = "cable-patcher"
    min_version = "4.0.0"


config = NetBoxCablePatcherConfig
