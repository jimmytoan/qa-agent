import base64
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import ArtifactKind, RunArtifactModel

ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / 'artifacts'
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def to_url_path(path: Path) -> str:
    return f"/artifacts/{path.name}"


def save_screenshot_artifact(run_id: str, result: object, db: Session) -> None:
    """Save a screenshot artifact for every step that has one."""
    history = getattr(result, 'history', None)
    if history is None:
        return

    for i, step in enumerate(history):
        state = getattr(step, 'state', None)
        screenshot_b64: str | None = getattr(state, 'screenshot', None)
        if not screenshot_b64:
            continue

        screenshot_path = ARTIFACTS_DIR / f'{run_id}-step-{i + 1}-screenshot.jpg'
        screenshot_path.write_bytes(base64.b64decode(screenshot_b64))

        db.add(
            RunArtifactModel(
                run_id=run_id,
                kind=ArtifactKind.screenshot,
                url=to_url_path(screenshot_path),
                content_type='image/jpeg',
                size_bytes=screenshot_path.stat().st_size,
            )
        )


def save_gif_artifact(run_id: str, task: str, result: object, db: Session) -> None:
    try:
        from browser_use.agent.gif import create_history_gif
    except Exception:
        return

    gif_path = ARTIFACTS_DIR / f'{run_id}.gif'

    try:
        create_history_gif(task=task, history=result, output_path=str(gif_path))
    except Exception:
        return

    if not gif_path.exists():
        return

    db.add(
        RunArtifactModel(
            run_id=run_id,
            kind=ArtifactKind.gif,
            url=to_url_path(gif_path),
            content_type='image/gif',
            size_bytes=gif_path.stat().st_size,
        )
    )
