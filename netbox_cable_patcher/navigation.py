from netbox.plugins import PluginMenu, PluginMenuItem, PluginMenuButton

menu = PluginMenu(
    label='Cable Patcher',
    groups=(
        ('', (
            PluginMenuItem(
                link='plugins:netbox_cable_patcher:patcher',
                link_text='Patch Bay View',
                permissions=['dcim.view_cable'],
            ),
        )),
    ),
    icon_class='mdi mdi-cable-data'
)
