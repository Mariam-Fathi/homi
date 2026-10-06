import pytest

from app.experiments import EXPERIMENTS, Experiment, assign, assignments_for

AB = Experiment(key="test_ab", description="", variants={"control": 0.5, "treatment": 0.5})


def test_assignment_is_sticky():
    assert {assign(AB, "user-1") for _ in range(20)} == {assign(AB, "user-1")}


def test_split_matches_the_configured_shares():
    users = [f"user-{i}" for i in range(20_000)]
    treated = sum(assign(AB, u) == "treatment" for u in users) / len(users)
    # 20,000 fair coin flips land within ±1.5 percentage points of 50% with
    # probability > 99.99%.
    assert treated == pytest.approx(0.5, abs=0.015)

    uneven = Experiment(key="uneven", description="", variants={"a": 0.9, "b": 0.1})
    share_b = sum(assign(uneven, u) == "b" for u in users) / len(users)
    assert share_b == pytest.approx(0.1, abs=0.01)


def test_experiments_split_people_independently():
    other = Experiment(key="another_test", description="", variants={"a": 0.5, "b": 0.5})
    users = [f"user-{i}" for i in range(20_000)]
    both = sum(assign(AB, u) == "treatment" and assign(other, u) == "b" for u in users)
    # Independent 50/50 splits overlap on about a quarter of people.
    assert both / len(users) == pytest.approx(0.25, abs=0.015)


def test_shares_must_add_up_to_one():
    with pytest.raises(ValueError):
        Experiment(key="bad", description="", variants={"a": 0.5, "b": 0.6})


def test_assignments_endpoint(client, make_user, auth_headers):
    user = make_user()
    response = client.get("/experiments/assignments", headers=auth_headers(user))

    assert response.status_code == 200
    assert response.json() == assignments_for(user.id)
    assert set(response.json()) == {k for k, e in EXPERIMENTS.items() if e.active}
    assert client.get("/experiments/assignments").status_code == 401
