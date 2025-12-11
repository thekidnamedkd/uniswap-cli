# Uniswap V3 Test Pool CLI (Sepolia)

This CLI tool lets you perform three core Uniswap V3 actions on **Sepolia** using `viem`:

1. **Initialize a brand-new Uniswap V3 pool** with a custom starting price
2. **Add liquidity** to an existing pool at any fee tier
3. **Wrap ETH → WETH** for use in liquidity positions

It is designed for rapid dApp integration testing using real Uniswap V3 contracts on the Sepolia test network.

---

## Features

### 1. Initialize a New Pool

* Choose any of the standard Uniswap V3 fee tiers (`500`, `3000`, `10000`).
* Selecting a fee tier that does **not** already exist for your token pair will create a **new pool**.
* Set an arbitrary starting price (e.g., `4000 TOKEN per 1 WETH`).
* Mints full-range liquidity (`-887220` to `887220`).

### 2. Add Liquidity to Existing Pools

* Approve the NonfungiblePositionManager once; approvals are reused.
* Add TOKEN/WETH liquidity at any fee tier.
* Uniswap only uses the amounts matching the pool’s current price; unused tokens stay in your wallet.

### 3. Wrap ETH → WETH (Standalone Mode)

* Wrap any amount of Sepolia ETH into WETH.
* Calls `deposit()` directly on the Sepolia WETH contract.

---

## Requirements

* Node.js ≥ 18
* TypeScript
* `viem`
* A Sepolia RPC provider (Infura, Alchemy, etc.)
* A test wallet with Sepolia ETH

---

## Install

```sh
npm install
```

Expected repo:

```
src/uniswapCli.ts
package.json
tsconfig.json
```

---

## Usage

Run the CLI:

```sh
npm start
```

Program will prompt for:

1. **Mode:**

   ```
   [1] Initialize pool + add first liquidity
   [2] Add more liquidity
   [3] Wrap ETH → WETH only
   ```
2. **RPC URL**
3. **Private key** (never saved)
4. Mode-specific arguments

---

## Example Workflows

### Initialize a pool at 4000:1

```
Mode: 1
Fee tier: 500
Token: <ERC20>
Target price: 4000
Wrap ETH? y
Wrap: 0.2
ERC20 liquidity: 800
WETH liquidity: 0.2
```

Creates a new MERC/WETH 500 pool at ~4000 MERC per 1 WETH.

### Add liquidity to existing pool

```
Mode: 2
Fee tier: 500
Token: <ERC20>
ERC20 amount: 800
WETH amount: 0.2
```

Only price-matching amounts are used; remaining tokens stay in wallet.

### Wrap ETH only

```
Mode: 3
Amount: 0.2 ETH
```

Converts ETH → WETH using `deposit()`.

---

## Addresses Used

**WETH (Sepolia)**

```
0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9
```

**NonfungiblePositionManager (Sepolia)**

```
0x1238536071e1c677a632429e3655c799b22cda52
```

---

## Security Notes

* Private key is **only in RAM**, never written to disk.
* No logs, no export, no persistence.
* Script ends → key disappears.

---

## Common Pitfalls

### Wrong Fee Tier

Existing `(token0, token1, fee)` pools cannot be reinitialized. Choose a fee tier that does **not** exist.

### Added Liquidity Looks Too Small

Uniswap uses requested amounts as **maximums**, not required values. Only curve-matching amounts are consumed.

### Approvals

Unlimited approvals to NPM are required for LP actions.

---

## Output

* Wrap transaction hash
* Pool initialization hash
* Mint transaction hash
* Block confirmations

All steps use `waitForTransactionReceipt` for sequential, verified execution.

---

MIT License
