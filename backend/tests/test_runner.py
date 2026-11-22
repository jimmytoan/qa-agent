import os
import pytest

os.environ.setdefault(
    'DATABASE_URL',
    'postgresql+psycopg://user:password@localhost:5432/qa_agent_test',
)

from app.services.runner import _build_llm


def test_retired_github_models_provider_is_rejected():
    with pytest.raises(RuntimeError, match='retired'):
        _build_llm('github/gpt-4o-mini')
