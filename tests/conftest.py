"""Pytest configuration for netbox_cable_patcher tests."""

import os
import sys

import django
from django.conf import settings


def pytest_configure():
    """Configure Django settings for testing."""
    # Add the parent directory to sys.path so we can import the plugin
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # Only configure if Django settings are not already configured
    if not settings.configured:
        settings.configure(
            DEBUG=True,
            DATABASES={
                'default': {
                    'ENGINE': 'django.db.backends.sqlite3',
                    'NAME': ':memory:',
                }
            },
            INSTALLED_APPS=[
                'django.contrib.contenttypes',
                'django.contrib.auth',
                'rest_framework',
            ],
            ROOT_URLCONF='',
            SECRET_KEY='test-secret-key-for-testing-only',
            USE_TZ=True,
        )
        django.setup()
