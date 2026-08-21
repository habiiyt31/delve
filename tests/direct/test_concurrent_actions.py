"""
Tests for concurrent games / interleaved actions.

game_id is the only thing that scopes a Game record, and multiple
delves can be in flight at once (different players, or the same player
running more than one game). These tests confirm that interleaving
take_action calls across games never lets one game's turn leak into,
overwrite, or otherwise affect another's state -- and that the
ownership check from test_authorization.py holds up under interleaving,
not just in isolation.
"""

import json

from tests.direct.conftest import owns


def _mock_step(vm, *, next_room="entrance", hp_delta=0, item_found=""):
    vm.clear_mocks()
    vm.mock_llm(
        r".*",
        json.dumps(
            {
                "narrative": "The dungeon responds.",
                "next_room": next_room,
                "hp_delta": hp_delta,
                "item_found": item_found,
            }
        ),
    )


def test_two_players_concurrent_games_are_independent(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/delve_dungeon.py")

    direct_vm.sender = direct_alice
    alice_gid = contract.start_game("Alice")

    direct_vm.sender = direct_bob
    bob_gid = contract.start_game("Bob")

    assert alice_gid != bob_gid

    # Alice moves into the crypt and picks up a torch.
    direct_vm.sender = direct_alice
    _mock_step(direct_vm, next_room="crypt_stairs", hp_delta=-5, item_found="Torch")
    contract.take_action(alice_gid, "head down the stairs")

    # Bob, interleaved, moves the opposite direction and finds nothing.
    direct_vm.sender = direct_bob
    _mock_step(direct_vm, next_room="flooded_hall", hp_delta=-10, item_found="")
    contract.take_action(bob_gid, "wade into the flooded hall")

    alice_game = contract.get_game(alice_gid)
    bob_game = contract.get_game(bob_gid)

    assert owns(alice_game, direct_alice)
    assert str(alice_game.room) == "crypt_stairs"
    assert int(alice_game.hp) == 95
    assert int(alice_game.turn) == 1
    assert "Torch" in str(alice_game.inventory_csv).split(",")

    assert owns(bob_game, direct_bob)
    assert str(bob_game.room) == "flooded_hall"
    assert int(bob_game.hp) == 90
    assert int(bob_game.turn) == 1
    assert str(bob_game.inventory_csv) == ""

    # A second interleaved round: act on bob's game only, confirm
    # alice's game is untouched by it.
    direct_vm.sender = direct_bob
    _mock_step(direct_vm, next_room="old_forge", hp_delta=0, item_found="Old Rope")
    contract.take_action(bob_gid, "press onward")

    alice_game_after = contract.get_game(alice_gid)
    bob_game_after = contract.get_game(bob_gid)

    assert str(alice_game_after.room) == "crypt_stairs"
    assert int(alice_game_after.turn) == 1
    assert int(alice_game_after.hp) == 95

    assert str(bob_game_after.room) == "old_forge"
    assert int(bob_game_after.turn) == 2
    assert "Old Rope" in str(bob_game_after.inventory_csv).split(",")


def test_same_player_multiple_games_are_independent(direct_vm, direct_deploy, direct_alice):
    """One wallet can run several delves at once; acting on one must
    never bleed into another, even though game.player is identical."""
    contract = direct_deploy("contracts/delve_dungeon.py")
    direct_vm.sender = direct_alice

    gid_a = contract.start_game("Alice Run A")
    gid_b = contract.start_game("Alice Run B")
    assert gid_a != gid_b

    _mock_step(direct_vm, next_room="flooded_hall", hp_delta=-8, item_found="Waterlogged Map")
    contract.take_action(gid_b, "explore run B")

    run_a = contract.get_game(gid_a)
    run_b = contract.get_game(gid_b)

    # Run A was never acted on -- still at its start_game state.
    assert str(run_a.room) == "entrance"
    assert int(run_a.turn) == 0
    assert int(run_a.hp) == 100
    assert str(run_a.inventory_csv) == ""

    assert str(run_b.room) == "flooded_hall"
    assert int(run_b.turn) == 1
    assert int(run_b.hp) == 92
    assert "Waterlogged Map" in str(run_b.inventory_csv).split(",")


def test_interleaved_authorization_holds_under_concurrency(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """
    Alternate real turns on two different games with attempted
    cross-game intrusions mixed in between -- every intrusion must
    fail and never advance the target game's turn counter, regardless
    of how much unrelated, legitimate activity happens around it.
    """
    contract = direct_deploy("contracts/delve_dungeon.py")

    direct_vm.sender = direct_alice
    alice_gid = contract.start_game("Alice")
    direct_vm.sender = direct_bob
    bob_gid = contract.start_game("Bob")

    revert_msg = "only the delver who started this game can act on it"

    # Round 1: alice acts on her own game (legitimate).
    direct_vm.sender = direct_alice
    _mock_step(direct_vm)
    contract.take_action(alice_gid, "look around")

    # Round 1.5: bob tries to piggyback on alice's game (illegitimate).
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert(revert_msg):
        contract.take_action(alice_gid, "loot alice's delve")

    # Round 2: bob acts on his own game (legitimate).
    _mock_step(direct_vm)
    contract.take_action(bob_gid, "look around")

    # Round 2.5: alice tries to reach into bob's game (illegitimate).
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert(revert_msg):
        contract.take_action(bob_gid, "loot bob's delve")

    alice_game = contract.get_game(alice_gid)
    bob_game = contract.get_game(bob_gid)

    # Only the legitimate turns landed -- one each, no extra state
    # change smuggled in through the rejected cross-game calls.
    assert int(alice_game.turn) == 1
    assert int(bob_game.turn) == 1
    assert owns(alice_game, direct_alice)
    assert owns(bob_game, direct_bob)


def test_game_ids_sequential_and_isolated_under_interleaved_starts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """Interleaving start_game across players still hands out distinct,
    sequential IDs, and each record's own hero name never leaks into
    another's."""
    contract = direct_deploy("contracts/delve_dungeon.py")

    direct_vm.sender = direct_alice
    gid1 = contract.start_game("Alice")
    direct_vm.sender = direct_bob
    gid2 = contract.start_game("Bob")
    direct_vm.sender = direct_charlie
    gid3 = contract.start_game("Charlie")
    direct_vm.sender = direct_alice
    gid4 = contract.start_game("Alice Again")

    assert [gid1, gid2, gid3, gid4] == [0, 1, 2, 3]
    assert contract.get_game_count() == 4

    assert str(contract.get_game(gid1).hero) == "Alice"
    assert str(contract.get_game(gid2).hero) == "Bob"
    assert str(contract.get_game(gid3).hero) == "Charlie"
    assert str(contract.get_game(gid4).hero) == "Alice Again"

    assert owns(contract.get_game(gid1), direct_alice)
    assert owns(contract.get_game(gid2), direct_bob)
    assert owns(contract.get_game(gid3), direct_charlie)
    assert owns(contract.get_game(gid4), direct_alice)
