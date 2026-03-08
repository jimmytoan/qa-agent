from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    env: Literal['local', 'dev', 'prod', 'test'] = 'local'

    @property
    def in_local_mode(self) -> bool:
        return self.env == 'local'


settings = Settings()
