from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.auth import router as auth_router
from backend.app.api.projects import router as projects_router
from backend.app.api.reviews import router as reviews_router
from backend.app.api.submissions import router as submissions_router
from backend.app.core.config import get_settings
from backend.app.core.errors import http_exception_handler, validation_exception_handler


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="GreenChain MVP API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    app.include_router(auth_router)
    app.include_router(projects_router)
    app.include_router(reviews_router)
    app.include_router(submissions_router)
    return app


app = create_app()
