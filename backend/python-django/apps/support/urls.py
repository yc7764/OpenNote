from django.urls import path
from .views import FAQListView, ContactInquiryCreateView, ContactInquiryListView, ContactInquiryStatusView

app_name = 'support'

urlpatterns = [
    path('faq/', FAQListView.as_view(), name='faq-list'),
    path('contact/', ContactInquiryCreateView.as_view(), name='contact-create'),
    path('contact/history/', ContactInquiryListView.as_view(), name='contact-history'),
    path('contact/status/', ContactInquiryStatusView.as_view(), name='contact-status'),
]
