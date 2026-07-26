import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# ==========================================
# SECURITY CONFIGURATION CONSTANTS
# ==========================================
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-me-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Cryptographically verifies a plaintext password against a stored 
    bcrypt hash using constant-time comparison to prevent timing attacks.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'), 
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """
    Generates a secure salted bcrypt hash. Explicitly enforces 
    bcrypt's hard 72-byte protocol truncation constraint (:72) 
    to prevent unhandled value errors during hashing.
    """
    password_bytes = password.encode('utf-8')[:72]
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Encodes subject claims into a cryptographically signed JWT access token 
    utilizing symmetric HMAC-SHA256 (HS256).
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    """
    Validates the cryptographic signature and expiration timestamp of a JWT token, 
    returning the decoded payload claims dictionary if verified.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# ==========================================
# ZERO-TRUST PERIMETER DEPENDENCIES
# ==========================================

# Maps the OAuth2 Bearer token scheme to the token generation endpoint
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Zero-Trust Security Guard (ASGI Edge Dependency):
    Intercepts incoming requests, validates the cryptographic JWT bearer token, 
    and aborts unauthorized execution instantly with a 401 status code 
    before resource-intensive application logic executes.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token has expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
        
    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception
        
    return {"email": email}