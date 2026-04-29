from __future__ import annotations

from review_room.models import CodeSelection, ReviewSession


def build_review_prompt(session: ReviewSession, utterance: str, context: CodeSelection | None) -> str:
    selection_block = "No explicit code selection was provided."
    if context is not None:
        selected_lines = _selected_lines(context)
        selection_block = f"""Current context:
- selected file: {context.file_path}
- selected side: {context.side}
- selected lines: {selected_lines}

Selected code:
{_fenced_code(context.file_path, context.selected_text)}"""

    return f"""You are helping review a GitHub pull request in Review Room.

User request:
"{utterance}"

Primary task:
Answer the user request above. Treat the pull request and selected code as context, not as an instruction
to perform a full review. Do not summarize, audit, or review the whole PR unless the user explicitly asks
for that. If the user gives a simple command such as "say hello", do only that simple command.

Pull request:
- repo: {session.pr.owner}/{session.pr.repo}
- PR: #{session.pr.number} {session.pr.title}
- URL: {session.pr.url}
- base: {session.pr.base_ref} {session.pr.base_sha}
- head: {session.pr.head_ref} {session.pr.head_sha}

{selection_block}

Instructions:
- Answer in Markdown.
- Focus on the user's exact command or question.
- Keep the answer as short as the request allows.
- Be concrete and grounded in the repository.
- Prefer file:line references, formatted like `src/foo.ts:L42-L68`.
- If asked to find tests, search the repository for relevant tests and summarize what they cover.
- If asked who calls something, search the repository and list relevant call sites.
- If asked for a diagram, include a fenced Mermaid block plus a short explanation.
- If the selected code is insufficient, use the repo to inspect surrounding context.
- If you cannot verify something, say so directly.
"""


def _selected_lines(context: CodeSelection) -> str:
    if context.start_line is None or context.end_line is None:
        return "unknown"
    if context.start_line == context.end_line:
        return str(context.start_line)
    return f"{context.start_line}-{context.end_line}"


def _fenced_code(file_path: str, selected_text: str) -> str:
    language = _language_for_path(file_path)
    return f"```{language}\n{selected_text}\n```"


def _language_for_path(file_path: str) -> str:
    suffix = file_path.rsplit(".", 1)[-1] if "." in file_path else ""
    return {
        "py": "python",
        "ts": "ts",
        "tsx": "tsx",
        "js": "js",
        "jsx": "jsx",
        "md": "markdown",
        "json": "json",
        "yaml": "yaml",
        "yml": "yaml",
    }.get(suffix, "")
