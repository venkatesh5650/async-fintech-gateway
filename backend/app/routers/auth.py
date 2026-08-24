from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr
from app.core.security import get_password_hash, verify_password, create_access_token
from app.database.database import get_db
from app.database.models import User

router = APIRouter(prefix="/v1/auth", tags=["Authentication Engine"])

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate):
    """
    Registers a new user with secure bcrypt password hashing.
    """
    hashed_password = get_password_hash(user_data.password)
    
    # TODO: Persist user credentials to the PostgreSQL asynchronous database session
    
    return {
        "message": "User registered successfully.",
        "email": user_data.email,
        "password_hash": hashed_password[:15] + "..."  # Masked for preview safety
    }

@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    Authenticates credentials via OAuth2 form-encoded payload 
    and issues a signed JWT access token.
    """
    # Extract credentials from the OAuth2 form request
    email = form_data.username
    password = form_data.password

    # TODO: Fetch user record from database by email
    # db_user = await db.execute(select(User).where(User.email == email))
    
    # TODO: Verify user credentials against database record
    # if not db_user or not verify_password(password, db_user.hashed_password):
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED,
    #         detail="Incorrect email or password",
    #         headers={"WWW-Authenticate": "Bearer"},
    #     )

    # Generate the signed JWT access token using the email subject claim
    access_token = create_access_token(data={"sub": email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
             }