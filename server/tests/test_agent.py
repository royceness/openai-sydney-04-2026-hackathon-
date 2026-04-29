import json
from pathlib import Path

import pytest

from review_room.agent import CodexAppServerAgent


def test_codex_agent_requests_spark_fast_medium_reasoning() -> None:
    agent = CodexAppServerAgent(command="codex")

    thread_params = agent._thread_start_params("/tmp/repo")
    turn_params = agent._turn_start_params("codex-thread-1", "/tmp/repo", "Explain this")

    assert thread_params["model"] == "gpt-5.3-codex-spark"
    assert thread_params["serviceTier"] == "fast"
    assert turn_params["model"] == "gpt-5.3-codex-spark"
    assert turn_params["serviceTier"] == "fast"
    assert turn_params["effort"] == "medium"


@pytest.mark.asyncio
async def test_codex_agent_reuses_one_app_server_process(monkeypatch, tmp_path: Path) -> None:
    created_processes: list[FakeProcess] = []

    async def fake_create_subprocess_exec(*args, **kwargs):
        process = FakeProcess()
        created_processes.append(process)
        return process

    monkeypatch.setattr("review_room.agent.asyncio.create_subprocess_exec", fake_create_subprocess_exec)
    agent = CodexAppServerAgent(command="codex")

    first = await agent.run_thread(str(tmp_path), "First", "First prompt")
    second = await agent.run_thread(str(tmp_path), "Second", "Second prompt")

    assert first.markdown == "First response"
    assert second.markdown == "Second response"
    assert len(created_processes) == 1
    sent_methods = [message["method"] for message in created_processes[0].stdin.messages]
    assert sent_methods == [
        "initialize",
        "thread/start",
        "turn/start",
        "thread/start",
        "turn/start",
    ]


@pytest.mark.asyncio
async def test_codex_agent_can_start_before_first_thread(monkeypatch, tmp_path: Path) -> None:
    created_processes: list[FakeProcess] = []

    async def fake_create_subprocess_exec(*args, **kwargs):
        process = FakeProcess()
        created_processes.append(process)
        return process

    monkeypatch.setattr("review_room.agent.asyncio.create_subprocess_exec", fake_create_subprocess_exec)
    agent = CodexAppServerAgent(command="codex")

    await agent.start()
    result = await agent.run_thread(str(tmp_path), "First", "First prompt")

    assert result.markdown == "First response"
    assert len(created_processes) == 1
    sent_methods = [message["method"] for message in created_processes[0].stdin.messages]
    assert sent_methods == ["initialize", "thread/start", "turn/start"]


@pytest.mark.asyncio
async def test_codex_agent_forwards_deltas(monkeypatch, tmp_path: Path) -> None:
    async def fake_create_subprocess_exec(*args, **kwargs):
        return FakeProcess()

    monkeypatch.setattr("review_room.agent.asyncio.create_subprocess_exec", fake_create_subprocess_exec)
    agent = CodexAppServerAgent(command="codex")
    deltas: list[str] = []

    result = await agent.run_thread(str(tmp_path), "First", "First prompt", on_delta=append_delta(deltas))

    assert deltas == ["First response"]
    assert result.markdown == "First response"


def append_delta(deltas: list[str]):
    async def _append(delta: str) -> None:
        deltas.append(delta)

    return _append


class FakeStdin:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    def write(self, data: bytes) -> None:
        self.messages.append(json.loads(data.decode()))

    async def drain(self) -> None:
        return None


class FakeStdout:
    def __init__(self) -> None:
        self._messages = [
            {"id": 1, "result": {"ok": True}},
            {"id": 2, "result": {"thread": {"id": "codex-thread-1"}}},
            {"id": 3, "result": {"turn": {"id": "turn-1"}}},
            {"method": "item/agentMessage/delta", "params": {"threadId": "codex-thread-1", "delta": "First response"}},
            {"method": "turn/completed", "params": {"threadId": "codex-thread-1"}},
            {"id": 4, "result": {"thread": {"id": "codex-thread-2"}}},
            {"id": 5, "result": {"turn": {"id": "turn-2"}}},
            {"method": "item/agentMessage/delta", "params": {"threadId": "codex-thread-2", "delta": "Second response"}},
            {"method": "turn/completed", "params": {"threadId": "codex-thread-2"}},
        ]

    async def readline(self) -> bytes:
        return (json.dumps(self._messages.pop(0)) + "\n").encode()


class FakeStderr:
    async def read(self) -> bytes:
        return b""


class FakeProcess:
    def __init__(self) -> None:
        self.stdin = FakeStdin()
        self.stdout = FakeStdout()
        self.stderr = FakeStderr()
        self.returncode = None

    def terminate(self) -> None:
        self.returncode = 0

    def kill(self) -> None:
        self.returncode = 1

    async def wait(self) -> int:
        return self.returncode or 0
