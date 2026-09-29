from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.utils import user_field


class CustomAccountAdapter(DefaultAccountAdapter):
    # 클라이언트 IP 판별은 재정의하지 않는다.
    # allauth 65.14.2+의 기본 구현이 settings의 ALLAUTH_TRUSTED_PROXY_COUNT를
    # 따라 X-Forwarded-For의 마지막 hop만 취하므로 위조에 안전하다.

    def is_open_for_signup(self, request):
        # allauth 기본 로컬 가입 폼(/accounts/signup/)을 통한 회원가입을 차단한다.
        # 회원가입은 커스텀 /api/auth/registration/ 경로만 사용하며, 그 경로만이
        # is_active=False + 이메일 인증 토큰 발급을 강제한다. 소셜 자동가입은
        # SocialAccountAdapter가 담당하므로 이 값의 영향을 받지 않는다.
        return False

    def save_user(self, request, user, form, commit=True):
        """
        Saves a new `User` instance using information provided in the
        signup form.
        """
        # dj-rest-auth passes a serializer where allauth expects a form.
        # This is a workaround to make them compatible.

        # Allauth's adapter expects a `_has_phone_field` attribute on the form.
        # We are not using phone numbers, so we can safely set it to False.
        # This attribute is checked in `allauth.account.adapter.DefaultAccountAdapter.save_user`
        if not hasattr(form, '_has_phone_field'):
            form._has_phone_field = False

        # Allauth's adapter also expects `cleaned_data` as an attribute,
        # while the serializer provides a `get_cleaned_data()` method.
        if not hasattr(form, 'cleaned_data'):
            form.cleaned_data = form.get_cleaned_data()

        # With the form (serializer) patched, we can call the parent method.
        # `commit=False` is passed to prevent the adapter from saving the user
        # to the database. The `save` is handled by the `RegisterSerializer`.
        user = super().save_user(request, user, form, commit=False)

        # Set our custom fields.
        user_field(user, 'first_name', form.cleaned_data.get('first_name'))
        user_field(user, 'last_name', form.cleaned_data.get('last_name'))

        # `dj-rest-auth`'s `RegisterSerializer.save` will save the user.
        # We don't need to do it here. So we respect the `commit` flag.
        if commit:
            user.save()

        return user 