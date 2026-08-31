from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    pass


class UserCreate(UserBase):
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)
