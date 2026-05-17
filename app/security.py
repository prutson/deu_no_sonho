from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        script_src = "'self' 'unsafe-inline'"
        connect_src = "'self'"

        if settings.ga4_measurement_id:
            script_src += " https://www.googletagmanager.com"
            connect_src += " https://*.google-analytics.com https://*.analytics.google.com"

        self._csp = (
            "default-src 'self'; "
            f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            f"font-src 'self' https://fonts.gstatic.com; "
            f"script-src {script_src}; "
            "img-src 'self' data:; "
            f"connect-src {connect_src};"
        )

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Content-Security-Policy"] = self._csp
        return response
