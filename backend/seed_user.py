import asyncio
from app.database.database import AsyncSessionLocal
from app.database.models import User
from app.core.security import get_password_hash
from sqlalchemy import select

async def seed_users():
    async with AsyncSessionLocal() as session:
        # Check existing users
        res = await session.execute(select(User))
        existing_users = res.scalars().all()
        print(f"Existing users count: {len(existing_users)}")
        
        default_users = [
            ("admin@fintech.com", "admin123"),
            ("user@fintech.com", "user123"),
            ("trader@fintech.com", "trader123")
        ]
        
        for email, password in default_users:
            stmt = select(User).where(User.email == email)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if not user:
                hashed = get_password_hash(password)
                new_user = User(email=email, hashed_password=hashed)
                session.add(new_user)
                print(f"✅ Created user: {email} (Password: {password})")
            else:
                print(f"ℹ️ User {email} already exists.")
        
        await session.commit()
        print("🎉 Database user seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed_users())
