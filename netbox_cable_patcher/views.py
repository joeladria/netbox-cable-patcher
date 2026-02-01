from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin

from dcim.models import Site, Location, Rack


class CablePatcherView(LoginRequiredMixin, PermissionRequiredMixin, TemplateView):
    """Main view for the cable patcher interface."""
    template_name = 'netbox_cable_patcher/patcher.html'
    permission_required = 'dcim.view_cable'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Get initial filter values from query params
        context['selected_site'] = self.request.GET.get('site', '')
        context['selected_location'] = self.request.GET.get('location', '')
        context['selected_rack'] = self.request.GET.get('rack', '')
        context['selected_device'] = self.request.GET.get('device', '')
        context['selected_mode'] = self.request.GET.get('mode', 'network')

        return context
