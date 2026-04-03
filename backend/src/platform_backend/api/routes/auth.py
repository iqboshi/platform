from fastapi import APIRouter
from pydantic import BaseModel

from platform_backend.schemas.platform import TokenResponse, UserProfile
from platform_backend.services.demo_data import current_user

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login", response_model=TokenResponse)
def login(_: LoginRequest) -> TokenResponse:
    return TokenResponse(access_token="platform-local-dev-token")


@router.get("/me", response_model=UserProfile)
def me() -> UserProfile:
    return current_user()
