"""
Tests for validator_fn's consensus checks in take_action.

Before this fix, item_found was schema/type-validated by
_validate_turn_payload but never *compared* between the leader's payload
and the validator's own independent replay -- unlike next_room and
hp_delta. That meant an inventory-mutating reward was written to state
on the leader's say-so alone, with no other validator ever agreeing
that their own execution produced the same item. These tests exercise
validator_fn directly (via direct_vm.run_validator(), which re-runs the
captured validator against whatever mocks are active) to confirm every
state-changing field -- including item_found -- now requires agreement.
"""

import json


def _start_and_act(vm, contract, sender, item_found="Rusty Key", next_room="entrance", hp_delta=0):
    vm.sender = sender
    gid = contract.start_game("Consensus Hero")
    vm.clear_mocks()
    vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "You find something glinting in the dust.",
                "next_room": next_room,
                "hp_delta": hp_delta,
                "item_found": item_found,
            }
        ),
    )
    contract.take_action(gid, "search the floor")
    return gid


def test_item_found_mismatch_is_rejected(direct_vm, direct_deploy, direct_alice):
    """
    A validator whose own independent replay finds a *different* item
    than the leader proposed must reject the turn -- an inventory
    reward is never accepted on the leader's word alone.
    """
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="Rusty Key")

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "You find nothing but dust and cobwebs.",
                "next_room": "entrance",
                "hp_delta": 0,
                "item_found": "Silver Coin",
            }
        ),
    )
    assert direct_vm.run_validator() is False


def test_item_found_exact_match_is_accepted(direct_vm, direct_deploy, direct_alice):
    """A validator whose replay finds the exact same item agrees."""
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="Rusty Key")

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "Different wording, same discovery.",
                "next_room": "entrance",
                "hp_delta": 0,
                "item_found": "Rusty Key",
            }
        ),
    )
    assert direct_vm.run_validator() is True


def test_item_found_case_and_whitespace_insensitive_match_is_accepted(
    direct_vm, direct_deploy, direct_alice
):
    """
    item_found is LLM-authored free text, not a value drawn from a
    fixed set like next_room -- trivial case/whitespace differences
    shouldn't break consensus on an otherwise-identical reward.
    """
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="Rusty Key")

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "Different wording, same discovery.",
                "next_room": "entrance",
                "hp_delta": 0,
                "item_found": "  RUSTY key  ",
            }
        ),
    )
    assert direct_vm.run_validator() is True


def test_no_item_found_agrees_with_no_item_found(direct_vm, direct_deploy, direct_alice):
    """The common case -- nobody found anything -- still reaches consensus."""
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="")

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "Nothing of note here.",
                "next_room": "entrance",
                "hp_delta": 0,
                "item_found": "",
            }
        ),
    )
    assert direct_vm.run_validator() is True


def test_next_room_mismatch_still_rejected(direct_vm, direct_deploy, direct_alice):
    """Regression check: the pre-existing next_room agreement rule
    (exact match) still holds after adding the item_found check."""
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="", next_room="entrance")

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "You barrel down the stairwell instead.",
                "next_room": "crypt_stairs",
                "hp_delta": 0,
                "item_found": "",
            }
        ),
    )
    assert direct_vm.run_validator() is False


def test_hp_delta_outside_tolerance_still_rejected(direct_vm, direct_deploy, direct_alice):
    """Regression check: the pre-existing hp_delta tolerance rule still
    holds after adding the item_found check."""
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="", hp_delta=0)

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "A hidden blade catches you badly.",
                "next_room": "entrance",
                "hp_delta": -30,  # 30 away from leader's 0, above HP_DELTA_TOLERANCE (10)
                "item_found": "",
            }
        ),
    )
    assert direct_vm.run_validator() is False


def test_hp_delta_within_tolerance_still_accepted(direct_vm, direct_deploy, direct_alice):
    """Regression check: small hp_delta disagreement within tolerance
    still reaches consensus."""
    contract = direct_deploy("contracts/delve_dungeon.py")
    _start_and_act(direct_vm, contract, direct_alice, item_found="", hp_delta=0)

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "A minor scrape, nothing serious.",
                "next_room": "entrance",
                "hp_delta": -5,  # within HP_DELTA_TOLERANCE (10) of leader's 0
                "item_found": "",
            }
        ),
    )
    assert direct_vm.run_validator() is True


def test_reward_never_written_without_consensus(direct_vm, direct_deploy, direct_alice):
    """
    End-to-end: when the (single, self-consistent) mock is used for
    both the leader and the auto-validation pass, consensus succeeds
    and the agreed item lands in inventory_csv -- confirming the happy
    path still works after the stricter validator_fn.
    """
    contract = direct_deploy("contracts/delve_dungeon.py")
    gid = _start_and_act(direct_vm, contract, direct_alice, item_found="Torch")

    game = contract.get_game(gid)
    assert "Torch" in str(game.inventory_csv).split(",")
