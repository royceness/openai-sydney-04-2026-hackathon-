from review_room.models import ChangedFile, CodeSelection, PullRequestInfo, ReviewSession
from review_room.prompting import build_review_prompt


def test_build_review_prompt_includes_pr_and_selection_context() -> None:
    session = ReviewSession(
        id="rev_acme_review_room_247",
        pr=PullRequestInfo(
            owner="acme",
            repo="review-room",
            number=247,
            title="Improve diagram layout",
            url="https://github.com/acme/review-room/pull/247",
            author="sarah-lee",
            body="Adds smarter diagram layout.",
            base_ref="main",
            head_ref="feature/diagram",
            base_sha="abc",
            head_sha="def",
        ),
        files=[
            ChangedFile(
                path="src/review/diagram.ts",
                status="modified",
                additions=48,
                deletions=17,
                patch="@@ -1 +1 @@",
            )
        ],
    )

    prompt = build_review_prompt(
        session,
        "Diagram this flow",
        CodeSelection(
            filePath="src/review/diagram.ts",
            side="new",
            startLine=201,
            endLine=208,
            selectedText="edge.points = simplify(path)",
        ),
    )

    assert "User request:\n\"Diagram this flow\"" in prompt
    assert "- repo: acme/review-room" in prompt
    assert "- selected file: src/review/diagram.ts" in prompt
    assert "- selected lines: 201-208" in prompt
    assert "```ts\nedge.points = simplify(path)\n```" in prompt
    assert "include a fenced Mermaid block" in prompt
