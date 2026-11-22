import asyncio
from io import BytesIO
from types import SimpleNamespace

from copilot.session_events import AssistantMessageData
from copilot.tools import ToolInvocation
from PIL import Image
import pytest

from app.services import artifacts, copilot_runner


class FakeElement:
    def __init__(self):
        self.filled_value = None

    async def click(self):
        return None

    async def fill(self, value):
        self.filled_value = value


class FakePage:
    def __init__(self):
        self.element = FakeElement()

    async def evaluate(self, _script):
        return 'Welcome'

    async def get_elements_by_css_selector(self, _selector):
        return [self.element]


class FakeBrowserSession:
    instances = []

    def __init__(self, *, browser_profile):
        self.browser_profile = browser_profile
        self.page = FakePage()
        self.url = 'about:blank'
        self.started = False
        self.stopped = False
        self.__class__.instances.append(self)

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True

    async def navigate_to(self, url):
        self.url = url

    async def must_get_current_page(self):
        return self.page

    async def get_current_page_title(self):
        return 'Example'

    async def get_current_page_url(self):
        return self.url

    async def take_screenshot(self, *, format):
        assert format == 'png'
        return b'png-frame'


class FakeCopilotSession:
    def __init__(self, options, perform_actions):
        self.options = options
        self.perform_actions = perform_actions
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        self.closed = True

    async def send_and_wait(self, prompt):
        assert 'Open the test page' in prompt
        if self.perform_actions:
            tools = {tool.name: tool for tool in self.options['tools']['definitions']}
            await tools['browser_navigate'].handler(ToolInvocation(arguments={
                'url': 'https://alice:private@example.test/login?token=private',
            }))
            await tools['browser_fill'].handler(ToolInvocation(arguments={
                'selector': '#password',
                'value': 'private-value',
            }))
        return SimpleNamespace(data=AssistantMessageData(content='PASS', message_id='message-1'))


class FakeCopilotClient:
    instance = None
    perform_actions = True

    def __init__(self, **options):
        self.options = options
        self.session = None
        self.__class__.instance = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def create_session(self, **options):
        self.session_options = options
        self.session = FakeCopilotSession(options, self.perform_actions)
        return self.session


def test_copilot_run_uses_only_browser_tools_and_streams_sanitized_steps(monkeypatch):
    FakeBrowserSession.instances.clear()
    FakeCopilotClient.instance = None
    monkeypatch.setattr(copilot_runner, 'BrowserSession', FakeBrowserSession)
    monkeypatch.setattr(copilot_runner, 'CopilotClient', FakeCopilotClient)
    monkeypatch.setattr(
        copilot_runner,
        'RuntimeConnection',
        SimpleNamespace(for_default=lambda **_kwargs: 'runtime'),
    )

    async def run():
        queue = asyncio.Queue()
        result = await copilot_runner.run_copilot_sdk_task(
            task='Open the test page',
            model_name='auto',
            queue=queue,
        )
        return result, [await queue.get(), await queue.get()]

    result, events = asyncio.run(run())
    browser = FakeBrowserSession.instances[0]
    client = FakeCopilotClient.instance
    allowed_tools = client.session_options['tools']['available_tools']

    assert result.final_result == 'PASS'
    assert result.screenshots == [b'png-frame', b'png-frame']
    assert browser.started and browser.stopped
    assert browser.page.element.filled_value == 'private-value'
    assert client.options['mode'] == 'empty'
    assert client.session_options['model'] == 'auto'
    assert allowed_tools == [
        'custom:browser_navigate',
        'custom:browser_inspect_page',
        'custom:browser_click',
        'custom:browser_fill',
    ]
    assert [event['step'] for event in events] == [1, 2]
    assert events[0]['actions'] == [{'navigate': {'url': 'https://example.test/login'}}]
    assert events[1]['actions'] == [{'fill': {'selector': '#password'}}]
    assert all(event['screenshot'] for event in events)
    assert 'private' not in repr(events)
    assert 'private-value' not in repr(events)


def test_copilot_run_fails_if_the_model_uses_no_browser_tools(monkeypatch):
    FakeBrowserSession.instances.clear()
    FakeCopilotClient.instance = None
    monkeypatch.setattr(FakeCopilotClient, 'perform_actions', False)
    monkeypatch.setattr(copilot_runner, 'BrowserSession', FakeBrowserSession)
    monkeypatch.setattr(copilot_runner, 'CopilotClient', FakeCopilotClient)
    monkeypatch.setattr(
        copilot_runner,
        'RuntimeConnection',
        SimpleNamespace(for_default=lambda **_kwargs: 'runtime'),
    )

    async def run():
        return await copilot_runner.run_copilot_sdk_task(
            task='Open the test page',
            model_name='auto',
        )

    with pytest.raises(RuntimeError, match='without browser actions'):
        asyncio.run(run())
    assert FakeBrowserSession.instances[0].stopped


def test_copilot_screenshots_are_saved_as_frames_and_gif(tmp_path, monkeypatch):
    class FakeDb:
        def __init__(self):
            self.artifacts = []

        def add(self, artifact):
            self.artifacts.append(artifact)

    def png(color):
        image = Image.new('RGB', (2, 2), color)
        output = BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()

    monkeypatch.setattr(artifacts, 'ARTIFACTS_DIR', tmp_path)
    db = FakeDb()

    artifacts.save_screenshot_frames('run-1', [png('red'), png('blue')], db)

    assert [artifact.kind.value for artifact in db.artifacts] == ['screenshot', 'screenshot', 'gif']
    assert (tmp_path / 'run-1-step-1-screenshot.png').is_file()
    assert (tmp_path / 'run-1-step-2-screenshot.png').is_file()
    with Image.open(tmp_path / 'run-1.gif') as gif:
        assert gif.n_frames == 2
