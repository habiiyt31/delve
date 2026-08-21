"""
Tests for take_action authorization.

Before this fix, take_action had no sender check at all: any wallet that
knew a game_id could call take_action on someone else's delve. These
tests confirm only game.player (the wallet that called start_game) can
advance that game, and that every other sender is rejected up front,
before any nondeterministic (LLM) work happens.
"""

import json

from tests.direct.conftest import owns

REVERT_MESSAGE = "only the delver who started this game can act on it"


def _mock_noop_turn(vm):
    """Deterministic leader response: stay put, no HP change, no item."""
    vm.clear_mocks()
    vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "The dungeon holds still.",
                "next_room": "entrance",
                "hp_delta": 0,
                "item_found": "",
            }
        ),
    )


def test_owner_can_take_action(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/delve_dungeon.py")
    direct_vm.sender = direct_alice
    gid = contract.start_game("Alice the Bold")

    _mock_noop_turn(direct_vm)
    status = contract.take_action(gid, "look around")

    assert status == "active"
    game = contract.get_game(gid)
    assert owns(game, direct_alice)
    assert int(game.turn) == 1


def test_non_owner_take_action_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/delve_dungeon.py")
    direct_vm.sender = direct_alice
    gid = contract.start_game("Alice the Bold")

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert(REVERT_MESSAGE):
        contract.take_action(gid, "steal alice's loot")

    # Confirm the rejected call left the game completely untouched.
    game = contract.get_game(gid)
    assert owns(game, direct_alice)
    assert int(game.turn) == 0
    assert str(game.room) == "entrance"
    assert int(game.hp) == 100


def test_non_owner_rejected_even_when_game_has_ended(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """
    Ownership is checked before the active/ended check, so a stranger
    gets the same authorization error whether or not the target game is
    still active -- it never leaks the game's status to a non-owner.
    """
    contract = direct_deploy("contracts/delve_dungeon.py")
    direct_vm.sender = direct_alice
    gid = contract.start_game("Alice the Bold")

    # Walk the legal path from entrance to throne_room (victory) so the
    # game reaches "ended" the same way a real playthrough would --
    # next_room must always be a real exit of the *current* room.
    _walk_to_victory(direct_vm, contract, gid)

    assert str(contract.get_game(gid).status) == "ended"

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert(REVERT_MESSAGE):
        contract.take_action(gid, "loot the throne room")


def _walk_to_victory(vm, contract, gid):
    path = ["crypt_stairs", "bone_library", "throne_room"]
    for room in path:
        vm.clear_mocks()
        vm.mock_llm(
            r".*",
            json.dumps(
                {
                    "narrative": f"You press onward into the {room}.",
                    "next_room": room,
                    "hp_delta": 0,
                    "item_found": "",
                }
            ),
        )
        contract.take_action(gid, f"go to {room}")


def test_each_player_owns_only_their_own_game(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Bob can freely act on his own delve; that doesn't grant him any
    access to alice's, and vice versa."""
    contract = direct_deploy("contracts/delve_dungeon.py")

    direct_vm.sender = direct_alice
    alice_gid = contract.start_game("Alice")

    direct_vm.sender = direct_bob
    bob_gid = contract.start_game("Bob")

    _mock_noop_turn(direct_vm)
    direct_vm.sender = direct_bob
    assert contract.take_action(bob_gid, "look around") == "active"

    with direct_vm.expect_revert(REVERT_MESSAGE):
        contract.take_action(alice_gid, "look around")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert(REVERT_MESSAGE):
        contract.take_action(bob_gid, "look around")

    assert contract.take_action(alice_gid, "look around") == "active"

    assert int(contract.get_game(alice_gid).turn) == 1
    assert int(contract.get_game(bob_gid).turn) == 1
