from pathlib import Path

import yaml


def test_docker_build_workflow_builds_the_workbench_image_on_push_and_pr():
    root = Path(__file__).resolve().parents[2]
    workflow = yaml.safe_load((root / ".github" / "workflows" / "docker-build.yml").read_text())

    assert workflow["name"] == "Docker Build"
    assert sorted(workflow["on"]) == ["pull_request", "push"]
    assert workflow["jobs"]["docker-build"]["permissions"] == {"contents": "read"}

    steps = workflow["jobs"]["docker-build"]["steps"]
    run_steps = [step.get("run", "") for step in steps]

    # ADR-0004: one image carries the API and the screen it serves.
    assert any("docker compose build backend" in step for step in run_steps)
    assert not any("frontend" in step for step in run_steps)
    # ADR-0005, line 2: the render service is its own small image.
    assert any("docker compose build render" in step for step in run_steps)
