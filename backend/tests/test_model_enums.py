from app.models import BrowserUseRunModel, RunArtifactModel, SuiteRunModel


def test_model_enum_names_match_postgres_migrations():
    assert BrowserUseRunModel.__table__.c.status.type.name == 'run_status'
    assert SuiteRunModel.__table__.c.status.type.name == 'suite_run_status'
    assert RunArtifactModel.__table__.c.kind.type.name == 'artifact_kind'
