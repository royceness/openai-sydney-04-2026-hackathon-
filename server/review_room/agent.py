from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class AgentError(RuntimeError):
    pass


@dataclass(frozen=True)
class AgentResult:
    codex_thread_id: str
    markdown: str


class CodeAgent(Protocol):
    async def run_thread(self, repo_path: str, title: str, prompt: str) -> AgentResult:
        pass


class CodexAppServerAgent:
    def __init__(self, command: str | None = None) -> None:
        self.command = command or os.environ.get("REVIEW_ROOM_CODEX_COMMAND", "codex")

    async def run_thread(self, repo_path: str, title: str, prompt: str) -> AgentResult:
        repo = Path(repo_path)
        if not repo.exists():
            raise AgentError(f"Repo path does not exist: {repo_path}")

        proc = await asyncio.create_subprocess_exec(
            self.command,
            "app-server",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            await self._send(
                proc,
                {
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "clientInfo": {"name": "review-room", "version": "0.1.0"},
                        "capabilities": {"experimentalApi": True},
                    },
                },
            )
            await self._response(proc, 1)

            await self._send(
                proc,
                {
                    "id": 2,
                    "method": "thread/start",
                    "params": {
                        "cwd": str(repo),
                        "approvalPolicy": "never",
                        "sandbox": "read-only",
                        "ephemeral": True,
                        "baseInstructions": "You are a code review assistant inside Review Room. Do not edit files.",
                    },
                },
            )
            thread_response = await self._response(proc, 2)
            codex_thread_id = thread_response["result"]["thread"]["id"]

            await self._send(
                proc,
                {
                    "id": 3,
                    "method": "turn/start",
                    "params": {
                        "threadId": codex_thread_id,
                        "cwd": str(repo),
                        "approvalPolicy": "never",
                        "input": [{"type": "text", "text": prompt, "text_elements": []}],
                    },
                },
            )
            await self._response(proc, 3)

            markdown = await self._collect_turn(proc, codex_thread_id)
            return AgentResult(codex_thread_id=codex_thread_id, markdown=markdown)
        finally:
            await self._terminate(proc)

    async def _send(self, proc: asyncio.subprocess.Process, message: dict) -> None:
        if proc.stdin is None:
            raise AgentError("Codex app-server stdin is unavailable")
        proc.stdin.write((json.dumps(message) + "\n").encode())
        await proc.stdin.drain()

    async def _response(self, proc: asyncio.subprocess.Process, request_id: int) -> dict:
        while True:
            message = await self._read_message(proc)
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise AgentError(f"Codex app-server request failed: {message['error']}")
            return message

    async def _collect_turn(self, proc: asyncio.subprocess.Process, codex_thread_id: str) -> str:
        deltas: list[str] = []
        while True:
            message = await self._read_message(proc, timeout=300)
            method = message.get("method")
            params = message.get("params") or {}
            if method == "item/agentMessage/delta" and params.get("threadId") == codex_thread_id:
                deltas.append(params.get("delta", ""))
            elif method == "turn/completed" and params.get("threadId") == codex_thread_id:
                return "".join(deltas).strip()
            elif method == "error":
                raise AgentError(str(params))

    async def _read_message(self, proc: asyncio.subprocess.Process, timeout: int = 60) -> dict:
        if proc.stdout is None:
            raise AgentError("Codex app-server stdout is unavailable")
        try:
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=timeout)
        except TimeoutError as exc:
            raise AgentError("Timed out waiting for Codex app-server") from exc
        if not line:
            stderr = ""
            if proc.stderr is not None:
                stderr = (await proc.stderr.read()).decode(errors="replace").strip()
            raise AgentError(f"Codex app-server exited unexpectedly: {stderr}")
        return json.loads(line)

    async def _terminate(self, proc: asyncio.subprocess.Process) -> None:
        if proc.returncode is not None:
            return
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except TimeoutError:
            proc.kill()
            await proc.wait()

