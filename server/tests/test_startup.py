from review_room.main import should_warm_codex_on_startup


def test_should_warm_codex_on_startup_defaults_to_true_outside_pytest(monkeypatch) -> None:
    monkeypatch.delenv("REVIEW_ROOM_WARM_CODEX_ON_STARTUP", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    assert should_warm_codex_on_startup()


def test_should_warm_codex_on_startup_skips_pytest_by_default(monkeypatch) -> None:
    monkeypatch.delenv("REVIEW_ROOM_WARM_CODEX_ON_STARTUP", raising=False)
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_startup.py::test")

    assert not should_warm_codex_on_startup()


def test_should_warm_codex_on_startup_allows_env_override(monkeypatch) -> None:
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_startup.py::test")
    monkeypatch.setenv("REVIEW_ROOM_WARM_CODEX_ON_STARTUP", "true")

    assert should_warm_codex_on_startup()
