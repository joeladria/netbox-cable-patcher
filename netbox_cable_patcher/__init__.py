"""Top-level package for NetBox Cable Patcher."""

__author__ = "Joel Adria, Moment Factory"
__email__ = ""
__version__ = "0.4.2"


from netbox.plugins import PluginConfig


class NetBoxCablePatcherConfig(PluginConfig):
    name = "netbox_cable_patcher"
    verbose_name = "Cable Patcher"
    description = "Visual patch bay interface for NetBox with interactive cable connections."
    version = __version__
    author = "Joel Adria, Moment Factory"
    author_email = ""
    base_url = "cable-patcher"
    min_version = "4.5.0"


config = NetBoxCablePatcherConfig
