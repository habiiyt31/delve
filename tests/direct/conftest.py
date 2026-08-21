"""Shared helpers for direct mode tests."""


def as_address(addr_bytes):
    """Wrap raw test-fixture bytes (direct_alice, direct_bob, ...) as a
    genlayer Address so it can be compared against a stored Address field
    (e.g. Game.player) with `==`.

    GOTCHA (see genlayer-project-boilerplate contracts/PatternTest.py):
    direct_alice/direct_bob/direct_charlie are raw 20-byte values, NOT
    Address instances, so `game.player == direct_alice` is always False
    even when they refer to the same account. Compare via
    `game.player == as_address(direct_alice)` instead.
    """
    from genlayer.py.types import Address

    return Address(addr_bytes)


def owns(game, addr_bytes) -> bool:
    """True if `game.player` (an Address) was set from `addr_bytes`."""
    return game.player == as_address(addr_bytes)
