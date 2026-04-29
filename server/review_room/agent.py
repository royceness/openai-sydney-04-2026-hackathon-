from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Protocol


class AgentError(RuntimeError):
    pass


@dataclass(frozen=True)
class AgentResult:
    codex_thread_id: str
    markdown: str


class CodeAgent(Protocol):
    async def run_thread(
        self,
        repo_path: str,
        title: str,
        prompt: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AgentResult:
        pass

    async def continue_thread(
        self,
        repo_path: str,
        codex_thread_id: str,
        prompt: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AgentResult:
        pass


class CodexAppServerAgent:
    model = "gpt-5.3-codex-spark"
    service_tier = "fast"
    reasoning_effort = "low"
    stdio_limit = 10 * 1024 * 1024

    def __init__(self, command: str | None = None) -> None:
        self.command = command or os.environ.get("REVIEW_ROOM_CODEX_COMMAND", "codex")
        self._proc: asyncio.subprocess.Process | None = None
        self._next_id = 1
        self._lock = asyncio.Lock()

    async def run_thread(
        self,
        repo_path: str,
        title: str,
        prompt: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AgentResult:
        repo = Path(repo_path)
        if not repo.exists():
            raise AgentError(f"Repo path does not exist: {repo_path}")

        async with self._lock:
            await self._ensure_started()
            thread_response = await self._request("thread/start", self._thread_start_params(str(repo)))
            codex_thread_id = thread_response["result"]["thread"]["id"]

            await self._request("turn/start", self._turn_start_params(codex_thread_id, str(repo), prompt))
            markdown = await self._collect_turn(codex_thread_id, on_delta)
            return AgentResult(codex_thread_id=codex_thread_id, markdown=markdown)

    async def continue_thread(
        self,
        repo_path: str,
        codex_thread_id: str,
        prompt: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AgentResult:
        repo = Path(repo_path)
        if not repo.exists():
            raise AgentError(f"Repo path does not exist: {repo_path}")

        async with self._lock:
            await self._ensure_started()
            await self._request("turn/start", self._turn_start_params(codex_thread_id, str(repo), prompt))
            markdown = await self._collect_turn(codex_thread_id, on_delta)
            return AgentResult(codex_thread_id=codex_thread_id, markdown=markdown)

    async def close(self) -> None:
        async with self._lock:
            await self._terminate()

    async def start(self) -> None:
        async with self._lock:
            await self._ensure_started()

    async def _ensure_started(self) -> None:
        if self._proc is not None and self._proc.returncode is None:
            return

        self._proc = await asyncio.create_subprocess_exec(
            self.command,
            "app-server",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=self.stdio_limit,
        )
        self._next_id = 1
        await self._request(
            "initialize",
            {
                "clientInfo": {"name": "review-room", "version": "0.1.0"},
                "capabilities": {"experimentalApi": True},
            },
        )

    async def _request(self, method: str, params: dict) -> dict:
        proc = self._active_proc()
        request_id = self._next_id
        self._next_id += 1
        await self._send({"id": request_id, "method": method, "params": params})
        return await self._response(request_id)

    def _thread_start_params(self, repo_path: str) -> dict:
        return {
            "cwd": repo_path,
            "approvalPolicy": "never",
            "sandbox": "read-only",
            "ephemeral": True,
            "model": self.model,
            "serviceTier": self.service_tier,
            "baseInstructions": "You are a code review assistant inside Review Room. Do not edit files.",
        }

    def _turn_start_params(self, codex_thread_id: str, repo_path: str, prompt: str) -> dict:
        return {
            "threadId": codex_thread_id,
            "cwd": repo_path,
            "approvalPolicy": "never",
            "model": self.model,
            "serviceTier": self.service_tier,
            "effort": self.reasoning_effort,
            "input": [{"type": "text", "text": prompt, "text_elements": []}],
        }

    async def _send(self, message: dict) -> None:
        proc = self._active_proc()
        if proc.stdin is None:
            raise AgentError("Codex app-server stdin is unavailable")
        proc.stdin.write((json.dumps(message) + "\n").encode())
        await proc.stdin.drain()

    async def _response(self, request_id: int) -> dict:
        while True:
            message = await self._read_message()
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise AgentError(f"Codex app-server request failed: {message['error']}")
            return message

    async def _collect_turn(self, codex_thread_id: str, on_delta: Callable[[str], Awaitable[None]] | None) -> str:
        deltas: list[str] = []
        while True:
            message = await self._read_message(timeout=300)
            method = message.get("method")
            params = message.get("params") or {}
            if method == "item/agentMessage/delta" and params.get("threadId") == codex_thread_id:
                delta = params.get("delta", "")
                deltas.append(delta)
                if on_delta is not None and delta:
                    await on_delta(delta)
            elif method == "turn/completed" and params.get("threadId") == codex_thread_id:
                return "".join(deltas).strip()
            elif method == "error":
                raise AgentError(str(params))

    async def _read_message(self, timeout: int = 60) -> dict:
        proc = self._active_proc()
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

    def _active_proc(self) -> asyncio.subprocess.Process:
        if self._proc is None:
            raise AgentError("Codex app-server is not started")
        return self._proc

    async def _terminate(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        if proc.returncode is not None:
            return
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except TimeoutError:
            proc.kill()
            await proc.wait()


class CodexAppServerAgentPool:
    def __init__(self, command: str | None = None, concurrency: int | None = None) -> None:
        self.concurrency = concurrency if concurrency is not None else int(os.environ.get("REVIEW_ROOM_CODEX_CONCURRENCY", "5"))
        if self.concurrency < 1:
            raise ValueError("REVIEW_ROOM_CODEX_CONCURRENCY must be at least 1")
        self._workers = [CodexAppServerAgent(command=command) for _ in range(self.concurrency)]
        self._available: asyncio.Queue[CodexAppServerAgent] = asyncio.Queue()
        for worker in self._workers:
            self._available.put_nowait(worker)

    async def start(self) -> None:
        await asyncio.gather(*(worker.start() for worker in self._workers))

    async def close(self) -> None:
        await asyncio.gather(*(worker.close() for worker in self._workers))

    async def run_thread(
        self,
        repo_path: str,
        title: str,
        prompt: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AgentResult:
        worker = await self._available.get()
        try:
            return await worker.run_thread(repo_path, title, prompt, on_delta)
        finally:
            self._available.put_nowait(worker)

    async def continue_thread(
        self,
        repo_path: str,
        codex_thread_id: str,
        prompt: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AgentResult:
        worker = await self._available.get()
        try:
            return await worker.continue_thread(repo_path, codex_thread_id, prompt, on_delta)
        finally:
            self._available.put_nowait(worker)
