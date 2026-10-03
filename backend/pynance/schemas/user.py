from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    pass


class UserCreate(UserBase):
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    default_asset_id: int | None = None


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    default_asset_id: int | None = None

    model_config = ConfigDict(from_attributes=True)
