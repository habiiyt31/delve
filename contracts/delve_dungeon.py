# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Delve — Onchain Dungeon Consensus
-----------------------------------------------------------------------------
An onchain dungeon crawl where every turn is a small adjudication: the
player describes an action in free text, an LLM narrates the outcome, and
independent validators must reach consensus on the *structured* part of
that outcome (which room the action leads to, how much HP it costs) before
anything is written onchain. The prose is different every single call; the
game state is not, because it went through GenLayer's non-deterministic
consensus instead of being trusted from one model call.

WHY THE ROOMS ARE A FIXED GRAPH:
  ROOM_GRAPH is a module-level constant, identical for every validator
  before any AI is involved. That means the only thing validators ever
  need to agree on is *which neighboring room* (or "stay put") an action
  leads to -- never the dungeon's geography itself. This is what makes
  consensus tractable even though the narrative text is never the same
  twice: next_room is checked for exact equality, hp_delta only needs to
  land within a small tolerance, and the free-text narrative is never
  compared at all.

VALIDATOR DESIGN (business-rule consistency, not just field matching):
  validator_fn doesn't just check "did every field come back the same" --
  it rejects outright any payload that's individually well-typed but
  inconsistent with the rules (next_room outside the current room's real
  exits, hp_delta outside the allowed range, an empty narrative). See
  _validate_turn_payload below, which both the leader's and my own replay
  of leader_fn are run through before anything is compared.

CLOSURE SAFETY:
  Every value leader_fn/validator_fn read is copied to a plain local
  variable *before* the closures are defined -- never read from `game`
  (a TreeMap-backed dataclass) or a method parameter inside a closure
  body itself. This avoids relying on how the GenVM sandbox serializes
  captured outer-scope state across the validator environment.

SCALAR-ONLY STORAGE FIELDS:
  Game only has scalar dataclass fields (str/u32/Address). Inventory and
  visited-room lists are encoded as comma-joined strings (inventory_csv,
  visited_csv) rather than list-typed fields, since this contract sticks
  to the same scalar-field dataclass shape proven to work for storage.

PER-TURN HISTORY LIVES OFF-CHAIN ON PURPOSE:
  Game only remembers the *latest* narrative and action, not a full turn
  log -- the same shape as this project's other adjudication contracts,
  where only the last resolution's reasoning is stored onchain and the
  full history comes from the frontend's activity log instead (see
  frontend/lib/activityLog.ts). Storing an unbounded turn-by-turn history
  onchain would grow every Game record forever with no way to prune it.

SINGLE-FILE CONSTRAINT:
  All logic, including the pure payload validator, lives in this one
  file on purpose -- GenVM deploys a contract from a single source file,
  so there's no import mechanism between separately-deployed contracts.

NON-UPGRADABLE: `upgraders` is never populated in __init__, so GenVM's
automatic root.lock_default() call after __init__ permanently freezes
the code slot. There is no admin, no override anywhere in the contract.
"""

from genlayer import *

from dataclasses import dataclass
import json
import typing


# ── Constants ────────────────────────────────────────────────────────────

# The dungeon is small and hand-authored on purpose: eight rooms is
# enough for a real crawl (a start, branching paths, a dead end, and a
# goal) while keeping every leader/validator prompt short. Adding a room
# is one dict entry here; nothing else in the contract needs to change.
ROOM_GRAPH = {
    "entrance": {"name": "The Sunken Entrance", "exits": ["crypt_stairs", "flooded_hall"]},
    "crypt_stairs": {"name": "Crypt Stairs", "exits": ["entrance", "bone_library", "black_abyss"]},
    "flooded_hall": {"name": "Flooded Hall", "exits": ["entrance", "old_forge"]},
    "bone_library": {"name": "Bone Library", "exits": ["crypt_stairs", "throne_room"]},
    "old_forge": {"name": "Old Forge", "exits": ["flooded_hall", "treasury"]},
    "treasury": {"name": "Treasury", "exits": ["old_forge", "throne_room"]},
    "throne_room": {"name": "Throne Room", "exits": ["bone_library", "treasury"]},
    "black_abyss": {"name": "Black Abyss", "exits": []},
}

GOAL_ROOM = "throne_room"

HP_DELTA_MIN = -35
HP_DELTA_MAX = 15
HP_DELTA_TOLERANCE = 10  # max allowed disagreement between leader and validator

MAX_HERO_NAME_CHARS = 40
MAX_ACTION_CHARS = 300
MAX_NARRATIVE_CHARS = 420
MAX_ITEM_CHARS = 40
MAX_INVENTORY_ITEMS = 8


# ── Storage shape ───────────────────────────────────────────────────────


@allow_storage
@dataclass
class Game:
    hero: str
    player: Address
    status: str  # "active" | "ended"
    room: str
    room_name: str
    hp: u32
    turn: u32
    inventory_csv: str  # comma-joined item names, "" if empty
    visited_csv: str  # comma-joined visited room ids
    last_action: str
    last_narrative: str
    last_item_found: str  # "" if this turn found nothing
    ended_reason: str  # "" | "VICTORY" | "DEATH"


# ── Pure helpers (no genlayer imports needed) ──────────────────────────


def _coerce_llm_json(value) -> dict:
    """
    Per the official SDK signature, gl.nondet.exec_prompt(..., response_format="json")
    already returns dict[str, Any] -- it must NOT be passed to json.loads()
    (doing so throws "the JSON object must be str, bytes or bytearray, not
    dict"). This still accepts a raw string as a fallback in case a given
    model/provider ever returns one anyway, so the contract degrades to an
    empty dict instead of crashing either way.
    """
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        try:
            parsed = json.loads(value)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _validate_turn_payload(d: dict, valid_moves: list) -> bool:
    """
    Schema + business-rule check for a leader/validator turn response.
    Rejects any response that's individually well-typed but internally
    inconsistent with what this turn was actually allowed to produce --
    e.g. a next_room the current room has no exit to, even if every
    field is otherwise the right type.
    """
    if not isinstance(d, dict):
        return False

    next_room = d.get("next_room")
    if next_room not in valid_moves:
        return False

    hp_delta = d.get("hp_delta")
    if not isinstance(hp_delta, int) or isinstance(hp_delta, bool):
        return False
    if hp_delta < HP_DELTA_MIN or hp_delta > HP_DELTA_MAX:
        return False

    narrative = d.get("narrative")
    if not isinstance(narrative, str) or not (0 < len(narrative.strip()) <= MAX_NARRATIVE_CHARS):
        return False

    item_found = d.get("item_found", "")
    if not isinstance(item_found, str) or len(item_found) > MAX_ITEM_CHARS:
        return False

    return True


def _split_csv(value: str) -> list:
    return [item for item in (value or "").split(",") if item]


def _join_csv(values: list) -> str:
    return ",".join(values)


class Delve(gl.Contract):
    games: TreeMap[u32, Game]
    next_game_id: u32

    def __init__(self):
        self.next_game_id = u32(0)
        # `upgraders` intentionally left empty -> permanently locked.

    # ---------------- views ----------------

    @gl.public.view
    def get_map(self) -> str:
        return json.dumps(ROOM_GRAPH, separators=(",", ":"))

    @gl.public.view
    def get_game(self, game_id: u32) -> Game:
        return self.games[game_id]

    @gl.public.view
    def get_game_count(self) -> u32:
        return self.next_game_id

    # ---------------- writes ----------------

    @gl.public.write
    def start_game(self, hero_name: str) -> u32:
        hero = (hero_name or "").strip()[:MAX_HERO_NAME_CHARS] or "A nameless delver"
        intro = (
            f"{hero} steps through the sunken entrance of the dungeon. Torchlight gutters "
            f"against wet stone. Two passages breathe cold air ahead: a stairwell down into "
            f"the crypt, and a flooded hall to the east."
        )

        game_id = self.next_game_id
        self.games[game_id] = Game(
            hero=hero,
            player=gl.message.sender_address,
            status="active",
            room="entrance",
            room_name=ROOM_GRAPH["entrance"]["name"],
            hp=u32(100),
            turn=u32(0),
            inventory_csv="",
            visited_csv="entrance",
            last_action="begin the delve",
            last_narrative=intro,
            last_item_found="",
            ended_reason="",
        )
        self.next_game_id = u32(game_id + 1)
        return game_id

    @gl.public.write
    def take_action(self, game_id: u32, action_text: str) -> str:
        """
        Anyone holding the game_id can call this (mirrors this project's
        other adjudication contracts, which are permissionless on their
        resolve step too) -- the interesting trust boundary here is
        validator consensus on the turn's outcome, not who's allowed to
        advance the story. Returns the resulting status: "active" or
        "ended".
        """
        game = self.games[game_id]
        if str(game.status) != "active":
            raise gl.vm.UserError("this delve has already ended")

        # Closure safety: copy everything leader_fn/validator_fn will
        # read into plain locals before either closure is defined.
        current_room = str(game.room)
        current_hp = int(game.hp)
        inventory = _split_csv(str(game.inventory_csv))
        action = (action_text or "").strip()[:MAX_ACTION_CHARS] or "wait and look around"
        room_name = str(ROOM_GRAPH[current_room]["name"])
        valid_moves = list(ROOM_GRAPH[current_room]["exits"]) + [current_room]

        def leader_fn() -> str:
            prompt = f"""
You are the Dungeon Master for Delve, an onchain fantasy dungeon crawl.

Current room: {room_name} (id: {current_room})
Player HP: {current_hp}/100
Inventory: {inventory}

Player action: "{action}"

Rules:
- Narrate in 2 to 4 vivid second-person sentences. Keep peril stylized fantasy danger, never graphic gore.
- "next_room" MUST be exactly one of this list, nothing else: {valid_moves}
  Pick the current room ("{current_room}") if the action does not lead anywhere new.
- "hp_delta" is an integer from {HP_DELTA_MIN} to {HP_DELTA_MAX} reflecting real danger, rest, or healing implied by the action and room.
- "item_found" is a short item name discovered this turn, or an empty string if none.

Respond only as JSON, no markdown fences, exactly:
{{"narrative": "...", "next_room": "...", "hp_delta": <integer>, "item_found": "..."}}
"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            data = _coerce_llm_json(raw)
            return json.dumps(
                {
                    "narrative": str(data.get("narrative", ""))[:MAX_NARRATIVE_CHARS],
                    "next_room": str(data.get("next_room", current_room)),
                    "hp_delta": int(data.get("hp_delta", 0)),
                    "item_found": str(data.get("item_found", ""))[:MAX_ITEM_CHARS],
                },
                sort_keys=True,
            )

        def validator_fn(leaders_res: typing.Any) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                leader = json.loads(leaders_res.calldata)
            except Exception:
                return False
            if not _validate_turn_payload(leader, valid_moves):
                return False

            mine = json.loads(leader_fn())
            if not _validate_turn_payload(mine, valid_moves):
                return False

            if mine["next_room"] != leader["next_room"]:
                return False
            return abs(int(mine["hp_delta"]) - int(leader["hp_delta"])) <= HP_DELTA_TOLERANCE

        try:
            raw_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
            result = json.loads(raw_result)
            narrative = str(result["narrative"])
            next_room = str(result["next_room"])
            hp_delta = int(result["hp_delta"])
            item_found = str(result["item_found"])
        except Exception:
            # No validator consensus was reached (or every call failed).
            # Never guess -- the turn is a no-op rather than a silent
            # state change nobody agreed on.
            narrative = (
                "The dungeon holds its breath. Whatever you tried does not seem to land, "
                "and the moment passes without consequence."
            )
            next_room = current_room
            hp_delta = 0
            item_found = ""

        new_hp = max(0, min(100, current_hp + hp_delta))

        if item_found and item_found not in inventory and len(inventory) < MAX_INVENTORY_ITEMS:
            inventory.append(item_found)

        visited = _split_csv(str(game.visited_csv))
        if next_room not in visited:
            visited.append(next_room)

        status = "active"
        ended_reason = ""
        if new_hp <= 0:
            status = "ended"
            ended_reason = "DEATH"
        elif next_room == GOAL_ROOM:
            status = "ended"
            ended_reason = "VICTORY"

        game.room = next_room
        game.room_name = str(ROOM_GRAPH[next_room]["name"])
        game.hp = u32(new_hp)
        game.turn = u32(int(game.turn) + 1)
        game.inventory_csv = _join_csv(inventory)
        game.visited_csv = _join_csv(visited)
        game.last_action = action
        game.last_narrative = narrative
        game.last_item_found = item_found
        game.status = status
        game.ended_reason = ended_reason

        return status
