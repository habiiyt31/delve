# Delve — Onchain Dungeon Consensus

Delve is an onchain dungeon crawl built as an adjudication contract in
the sense GenLayer itself uses that word. Every turn is a small
judgment call: the player describes an action in free text, an AI
narrates what happens, and the *state-changing* part of that
narration — which room it leads to, how much HP it costs — only
becomes real once independent validators reach consensus on it. The
prose is different every single call; the game state is not.

## Why a fixed room graph, not a freeform world

`ROOM_GRAPH` in `contracts/delve_dungeon.py` is a module-level
constant, identical for every validator before any AI is involved.
That's deliberate: it narrows what validators ever need to agree on
down to *which neighboring room* an action leads to (or "stay put"),
never the dungeon's geography itself. `next_room` is checked for exact
string equality between the leader's response and every validator's
own replay; `hp_delta` only needs to land within a small tolerance
(`HP_DELTA_TOLERANCE`). The free-text narrative itself is never
compared — two validators can (and will) describe the same outcome in
completely different words and still agree.

## Validators enforce consistency, not just matching fields

`take_action` uses a custom `gl.vm.run_nondet_unsafe` validator instead
of `gl.eq_principle.strict_eq`. It doesn't just check "did every field
come back the same" — `_validate_turn_payload` rejects outright any
response that's individually well-typed but inconsistent with what the
turn was actually allowed to produce, e.g. a `next_room` the current
room has no real exit to, or an `hp_delta` outside the allowed range,
even if every field is otherwise the right shape. Both the leader's
payload and my own independent replay of `leader_fn` are run through
that same validator before anything is compared.

## Closure safety

Every value `leader_fn`/`validator_fn` read is copied to a plain local
variable *before* either closure is defined — never read from `game`
(a `TreeMap`-backed dataclass) or a method parameter inside a closure
body itself. This avoids relying on how the GenVM sandbox serializes
captured outer-scope state across the validator environment.

## Scalar-only storage, off-chain turn history

`Game` only has scalar dataclass fields (`str`/`u32`/`Address`).
Inventory and visited-room lists are encoded as comma-joined strings
(`inventory_csv`, `visited_csv`) rather than list-typed fields. The
contract also only remembers the *latest* turn (`last_action`,
`last_narrative`, `last_item_found`), not a full log — an unbounded
per-turn history would grow every `Game` record forever with no way to
prune it. The full turn-by-turn history for a delve comes from the
frontend's activity log instead (`frontend/lib/activityLog.ts`), the
same shape this project's sibling contracts use for their own
resolution notes.

## Project structure

```
delve/
├── contracts/
│   └── delve_dungeon.py     # The Intelligent Contract (non-upgradable)
├── frontend/                 # Next.js (App Router, TypeScript, Tailwind)
│   ├── app/
│   │   ├── page.tsx                  # Home / how a turn is resolved
│   │   ├── delve/new/page.tsx        # Start a new delve
│   │   ├── delves/page.tsx           # Browse every delve
│   │   └── delve/[id]/page.tsx       # Delve detail, act, history
│   ├── components/          # NavBar, StatusPill, DungeonMap, VitalityDial, TurnVerdict, ActivityFeed
│   ├── lib/                 # genlayer.ts, contract.ts, useWallet.ts, activityLog.ts
│   └── .env.example
├── genlayer.config.json     # Network definitions (Studionet + Testnet Bradbury)
└── package.json
```

## Networks

Configured for **Studionet** by default (hosted, no local setup):

| Setting      | Value                              |
| ------------ | ----------------------------------- |
| GenLayer RPC | `https://studio.genlayer.com/api`  |
| Chain ID     | `61999`                            |
| Currency     | GEN                                |
| Explorer     | `explorer-studio.genlayer.com`     |
| Faucet       | Built-in 💧 button in Studio's account selector |

To switch to **Testnet Bradbury**, select it via `genlayer network` and
set `NEXT_PUBLIC_GENLAYER_NETWORK=testnetBradbury` in `frontend/.env`:

| Setting            | Value                                        |
| ------------------- | --------------------------------------------- |
| GenLayer RPC        | `https://rpc-bradbury.genlayer.com`          |
| GenLayer Chain RPC  | `https://rpc.testnet-chain.genlayer.com`     |
| Chain ID            | `4221`                                       |
| Currency            | GEN                                          |
| Explorer            | `explorer-bradbury.genlayer.com`             |
| Chain Explorer      | `explorer.testnet-chain.genlayer.com`        |
| Faucet              | `testnet-faucet.genlayer.foundation`         |

## Setup

```bash
# 1. Tooling
npm install -g genlayer
py -3.12 -m pip install genvm-linter

# 2. Frontend dependencies
cd frontend && npm install && cd ..

# 3. Network
genlayer network   # choose studionet (fund via the 💧 faucet) or testnetBradbury

# 4. Lint — non-upgradable, so this matters more than usual
genvm-lint check contracts/delve_dungeon.py

# 5. Deploy directly from the CLI (no deploy script)
genlayer deploy --contract contracts/delve_dungeon.py

# 6. Copy the printed contract address into frontend/.env
cd frontend && cp .env.example .env
# paste the address as NEXT_PUBLIC_CONTRACT_ADDRESS, then:
npm run dev
```

Delve's constructor (`__init__`) takes no arguments — the only thing it
does is leave `next_game_id` at zero and never populate `upgraders`.

> **Redeploying after any contract change?** `upgraders` is never
> populated in `__init__`, so GenVM permanently locks the code slot the
> instant `__init__` finishes running. There is no in-place upgrade
> path — every contract edit needs a fresh deploy to a new address, and
> the old address's delves are left behind, inaccessible from the new
> one.

## Testing

There's no separate test suite in this repo — verification happens in
two places:

**`genvm-lint check contracts/delve_dungeon.py`** before every deploy.
Since the contract can't be patched afterward, this is the primary
correctness gate.

**Manual QA against the deployed app**, in this order:

1. **Connect / disconnect wallet** — connect, confirm the address shows
   in the navbar, disconnect, refresh, confirm it stays disconnected
   (doesn't silently reconnect).
2. **Start a delve** — submit a hero name, confirm it redirects to the
   correct new delve ID, confirm it shows up in `/delves`.
3. **Act** — submit a few different actions, confirm the room, HP, and
   inventory all update, and that the dungeon minimap lights up the
   rooms you've actually visited.
4. **Check consensus in the Explorer** — open a `take_action`
   transaction in the [GenLayer
   Explorer](https://explorer-studio.genlayer.com/), confirm multiple
   validators ran and agreed under Equivalence Principle Outputs.
5. **Reach an ending** — either steer toward `throne_room` (victory) or
   take actions likely to cost HP until it hits 0 (death); confirm the
   status pill and ending banner update, and that the action form
   disappears once a delve has ended.
6. **Activity feed** — confirm transactions eventually show "Finalized"
   and don't stay stuck on "Pending" after a page reload.

## Design notes worth knowing

- **The dungeon graph is the entire trust boundary.** Every room and
  exit is a plain Python dict, identical across every validator before
  any nondeterminism is involved — see "Why a fixed room graph" above.
- **`_validate_turn_payload` enforces business rules, not just types.**
  See "Validators enforce consistency" above and the function itself in
  `contracts/delve_dungeon.py`.
- **CSV-encoded lists, not list-typed dataclass fields.** `inventory`
  and `visited` are stored as comma-joined strings and split/joined in
  the contract and in `frontend/lib/contract.ts` — see "Scalar-only
  storage" above.
- **No payout, no pool.** Unlike this project's other adjudication
  contracts, Delve has no economic layer — there's nothing to
  underwrite or reserve, so `deposit`/`withdraw`/pool accounting simply
  don't apply here and aren't included.
- **Fallback on no-consensus, never a guess.** If
  `gl.vm.run_nondet_unsafe` can't reach consensus (or every call
  fails), `take_action` falls back to a neutral no-op turn (same room,
  no HP change, no item) rather than trusting an unverified result.

## Deploying the frontend to Vercel

The frontend lives in `frontend/`, not the repo root, so Vercel needs
one non-default setting:

1. Import the repo in Vercel as usual.
2. In **Project Settings → General → Root Directory**, set it to
   `frontend`. Vercel auto-detects Next.js from there — no custom build
   command needed.
3. In **Project Settings → Environment Variables**, add the same
   values `frontend/.env.example` documents (`.env` itself is
   gitignored and never reaches Vercel):
   - `NEXT_PUBLIC_GENLAYER_NETWORK` = `studionet` (or `testnetBradbury`)
   - `NEXT_PUBLIC_GENLAYER_RPC_URL` = `https://studio.genlayer.com/api`
   - `NEXT_PUBLIC_CHAIN_ID` = `61999`
   - `NEXT_PUBLIC_EXPLORER_URL` = `https://explorer-studio.genlayer.com`
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = the address from your own
     `genlayer deploy` (see Setup above) — Vercel only serves the
     frontend, it doesn't deploy the contract.
4. Deploy. Redeploy (or update the env var and redeploy) any time the
   contract address changes, e.g. after a fresh deploy following a
   contract edit — see Non-upgradability below for why that happens
   more than you might expect.

## Non-upgradability

`contracts/delve_dungeon.py` never populates the `upgraders` list in
`__init__`. GenVM automatically calls `root.lock_default()` right after
`__init__` returns, permanently locking the code slot. There is no
admin function and no override anywhere in the contract.

## Path forward

- **More rooms, same pattern.** Adding a room is one `ROOM_GRAPH` entry
  — no other function needs to change, since every prompt and
  validator already reads exits off that dict rather than hardcoding
  the dungeon's shape.
- **NPCs and combat.** The current design only has the dungeon itself
  as an "opponent" (HP loss from hazards). A natural next step is a
  monster encounter with its own HP, resolved by the same
  leader/validator structured-consensus pattern already proven out
  here.
- **Community angle.** The turn-resolution pattern — fixed structural
  choices (`next_room` from a known set) plus a bounded numeric delta
  (`hp_delta`), validated for business-rule consistency rather than
  exact text match — generalizes to any narrative or game contract
  where the *shape* of the outcome needs consensus but the prose
  doesn't.

## License

MIT
