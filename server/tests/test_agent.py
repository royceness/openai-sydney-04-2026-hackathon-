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
