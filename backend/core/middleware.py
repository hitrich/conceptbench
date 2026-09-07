from uuid import uuid4


class RequestContext:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid4())
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id
        response["X-Frame-Options"] = "DENY"
        response["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "no-store"
        return response
