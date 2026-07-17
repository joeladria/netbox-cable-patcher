from netbox.plugins import PluginMenuItem

menu_items = (
    PluginMenuItem(
        link='plugins:netbox_cable_patcher:patcher',
        link_text='Cable Patcher',
        permissions=['dcim.view_cable'],
    ),
)
