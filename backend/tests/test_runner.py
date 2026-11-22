import os
import sys
from types import ModuleType

import pytest

os.environ.setdefault(
    'DATABASE_URL',
    'postgresql+psycopg://user:password@localhost:5432/qa_agent_test',
)

from app.services.runner import _build_llm


def test_github_models_uses_namespaced_model_and_token(monkeypatch):
    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    module = ModuleType('langchain_openai')
    module.ChatOpenAI = FakeChatOpenAI
    monkeypatch.setitem(sys.modules, 'langchain_openai', module)
    monkeypatch.setenv('GITHUB_MODELS_TOKEN', 'test-token')

    llm = _build_llm('github/gpt-4o-mini')

    assert llm.kwargs == {
        'model': 'gpt-4o-mini',
        'api_key': 'test-token',
        'base_url': 'https://models.github.ai/inference',
    }


def test_github_models_requires_dedicated_token(monkeypatch):
    monkeypatch.delenv('GITHUB_MODELS_TOKEN', raising=False)

    with pytest.raises(RuntimeError, match='GITHUB_MODELS_TOKEN'):
        _build_llm('github/gpt-4o-mini')
