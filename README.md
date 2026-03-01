# Rootstock Agentic DeFi Framework

A Node.js framework that lets AI agents autonomously manage DeFi positions on Rootstock. The agent connects via MCP, fetches live protocol data, simulates transactions before signing, and executes through a session-scoped policy engine — no human signature required per action.

## What this solves

Existing DeFi tooling is passive. You check rates, you manually rebalance, you watch health factors and hope you catch a drop before liquidation. This framework makes that active: an AI agent can watch your position health, get alerted when RBTC moves 1%+, and execute stop-loss or rebalancing actions within hard-coded spend limits — autonomously.

## Architecture

Four subsystems wired together at startup:

```
MCP Client (Claude / any AI)
        │
        ▼
   MCP Server  ──────────────────────────────────────┐
   (5 tools)                                          │
        │                                             │
        ├── get_protocol_data  → MOC + Tropykus RPC  │
        ├── simulate_swap      → viem call/estimateGas│
        ├── execute_intent     → Session + Policy ────┤
        ├── get_position_health → Tropykus health     │
        └── get_wallet_balances → ERC-20 balances     │
                                                      │
   Session Service  (in-memory, TTL-scoped keys) ◄───┤
   Policy Engine    (5 hard rules, audit log)    ◄───┘
   Block Monitor    (HTTP polling, WS optional)
```

**Block monitor note:** Rootstock mainnet produces blocks roughly every 11 seconds in practice (the nominal target is 30s, but the live network runs faster). The monitor uses `watchBlocks` polling at a 30s interval — meaning it catches every block but polls conservatively. If you need sub-second latency, point `RSK_MAINNET_WS_URL` at a WebSocket-capable provider.

## Protocol integrations

**Money on Chain** — reads `MoCState` directly on-chain:
- Bitcoin price (18-decimal precision)
- Global coverage ratio
- BPRO / DOC technical and USD prices
- Liquidation price

**Tropykus** (Compound fork on RSK) — reads Comptroller + cToken contracts:
- Per-market supply and borrow APY (standard Compound formula, 1,051,200 blocks/year)
- Available liquidity, total borrows
- Account position health: liquidity, shortfall, health factor

## Session keys

Sessions authorize an AI agent to act within limits without prompting for a signature on every transaction:

```
POST (in-memory) → create session
  ownerAddress   – wallet that signed the original authorization
  agentId        – identifier for the AI agent
  ttlSeconds     – capped at SESSION_DEFAULT_TTL_SECONDS
  maxSpendWei    – capped at SESSION_MAX_SPEND_RBTC (converted to wei)
  allowedContracts       – optional extra whitelist per session
  allowedFunctionSelectors – optional 4-byte selector allowlist

Validation chain on execute_intent:
  1. Session exists and is not expired or revoked
  2. Target contract is in session allowedContracts (if set)
  3. Function selector is in allowedFunctionSelectors (if set)
  4. valueWei + spentWei ≤ maxSpendWei
  5. Policy engine (see below)
```

## Policy engine

Hard-coded rules applied synchronously before any broadcast. Cannot be disabled via config:

| Rule | What it blocks |
|---|---|
| `block_zero_address` | `to` == `0x000...000` |
| `block_selfdestruct` | Calldata starting with `0xff` |
| `excessive_value` | Any single tx > 10 RBTC |
| `spend_limit` | Session cumulative spend exceeding cap |
| `contract_whitelist` | Target not in built-in + env whitelist |

Every evaluation (allow or deny) is written as a JSON line to stderr or a file depending on `AUDIT_LOG_DESTINATION`.

## Setup

```bash
git clone <repo>
cd rootstock-agentic-defi
npm install
cp .env.example .env
```

Edit `.env` — the only required change for mainnet is leaving defaults as-is. For testnet:

```bash
RSK_NETWORK=testnet
```

For WebSocket block monitoring (lower latency than polling):

```bash
# dRPC supports WebSocket on RSK:
RSK_MAINNET_WS_URL=wss://rootstock.drpc.org
```

## Running

```bash
# Development (tsx watch)
npm run dev

# Production
npm run build
npm start
```

Startup output:

```
[server] Rootstock Agentic DeFi — network: mainnet, rpc: https://public-node.rsk.co
[monitor] New block #8579844 at 2026-03-01T16:32:44.000Z
[monitor] New block #8579845 at 2026-03-01T16:32:55.000Z
```

Block times on mainnet: ~11 seconds observed, 30s nominal. All output goes to stderr — stdout carries the MCP wire protocol.

## MCP tools

### `get_protocol_data`

```json
{ "protocol": "all" }
```

Returns current Bitcoin price from MOC, global coverage, BPRO/DOC rates, and Tropykus market APYs.

### `simulate_swap`

```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amountIn": "1000000000000000000",
  "slippageBps": 50,
  "from": "0x..."
}
```

Checks on-chain balance, estimates output with slippage applied, returns gas estimate. No transaction is sent.

### `execute_intent`

```json
{
  "sessionId": "uuid-v4",
  "signedTransaction": "0x...",
  "targetContract": "0x...",
  "valueWei": "0",
  "dryRun": false
}
```

Runs session validation → policy engine → `sendRawTransaction`. Set `dryRun: true` to validate without broadcasting.

### `get_position_health`

```json
{ "account": "0x..." }
```

Returns Tropykus position: liquidity, shortfall, health factor, and per-market supply/borrow balances.

### `get_wallet_balances`

```json
{
  "address": "0x...",
  "tokenAddresses": ["0x...", "0x..."]
}
```

Native RBTC balance plus up to 20 ERC-20 token balances in one call.

## Connecting to Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rootstock-defi": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "RSK_NETWORK": "mainnet"
      }
    }
  }
}
```

Then in Claude: *"Check my position health on Tropykus for address 0x..."* or *"What's the current Bitcoin price on Money on Chain?"*

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `RSK_NETWORK` | `mainnet` | `mainnet` or `testnet` |
| `RSK_MAINNET_RPC_URL` | public node | HTTP RPC endpoint |
| `RSK_MAINNET_WS_URL` | *(blank)* | Leave blank for polling mode |
| `SESSION_DEFAULT_TTL_SECONDS` | `3600` | Max session lifetime cap |
| `SESSION_MAX_SPEND_RBTC` | `0.01` | Hard per-session spend ceiling |
| `POLICY_CONTRACT_WHITELIST` | *(blank)* | Comma-separated extra addresses |
| `AUDIT_LOG_DESTINATION` | `console` | `console` or `file` |
| `AUDIT_LOG_FILE_PATH` | `./audit.log` | Used when destination is `file` |

Built-in protocol contracts (MOC, Tropykus markets) are pre-populated in the whitelist and do not need to be added manually.

## Built-in contract whitelist

These are added automatically regardless of `POLICY_CONTRACT_WHITELIST`:

- `0x2820f6d4D199B8D8838A4B26F9917754B86a0c1F` — MoC
- `0x7f6057aC55E63a2f58d5B5a5Df3B0dE0b8BEDefc` — MoCState (mainnet)
- `0xc03ac60ebbc01a1f4e9b5bb989f359e5d8348919` — MoCExchange
- `0x962308Fef8EdfAdD705384840e7701f8F39ed0c0` — Tropykus Comptroller
- `0x0aeadb9d4c6a80462a47e87e76e487fa8b9a37d7` — kRBTC
- `0x544eb90e766b405134b3b3f62b6b4c23fcd5fda2` — kDOC
- `0x405062731d8656af5950ef952be9fa110878036b` — kBPRO
- `0xddf3ce45fcf080df61ee61dac5ddefef7ed4f46c` — kUSDRIF

## Stack

- `@modelcontextprotocol/sdk` 1.27.1
- `viem` 2.46.2
- `ws` 8.19.0
- `zod` 3.x
- `tsup` + `tsx` for build and dev
- Node.js ≥ 20
