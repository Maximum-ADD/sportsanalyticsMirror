from play_by_play import order_actions_by_sequence


def test_order_actions_by_sequence_sorts_late_actions():
    actions = [{"actionNumber": 3}, {"actionNumber": 1}, {"actionNumber": 2}]

    assert [action["actionNumber"] for action in order_actions_by_sequence(actions)] == [1, 2, 3]
