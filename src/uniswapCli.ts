// src/uniswapCli.ts
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  type Hex,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const WETH_ADDRESS: Address = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const NPM_ADDRESS: Address = "0x1238536071e1c677a632429e3655c799b22cda52";

const TICK_LOWER = -887220;
const TICK_UPPER = 887220;
const Q96 = 2n ** 96n;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const wethAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  ...erc20Abi,
] as const;

const npmAbi = [
  {
    type: "function",
    name: "createAndInitializePoolIfNecessary",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceX96", type: "uint160" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

type Mode = "init" | "add" | "wrap";

function encodePriceSqrt(price: number): bigint {
  const sqrt = Math.sqrt(price);
  return BigInt(Math.floor(sqrt * Number(Q96)));
}

async function askMode(rl: ReturnType<typeof createInterface>): Promise<Mode> {
  const answer = (
    await rl.question(
      [
        "Choose mode:",
        "[1] Initialize pool + add first liquidity",
        "[2] Add more liquidity to existing pool",
        "[3] Wrap ETH → WETH only",
        "Enter 1, 2, or 3: ",
      ].join("\n"),
    )
  )
    .trim()
    .toLowerCase();

  if (answer === "2") return "add";
  if (answer === "3") return "wrap";
  return "init";
}

async function main() {
  const rl = createInterface({ input, output });

  const mode = await askMode(rl);

  const defaultRpc = "https://sepolia.infura.io/v3/<YOUR_INFURA_PROJECT_ID>";
  const rpcUrlInput = await rl.question(`RPC URL [default: ${defaultRpc}]: `);
  const rpcUrl = rpcUrlInput.trim() || defaultRpc;

  const pkInput = await rl.question(
    "Private key (0x..., exported from your wallet): ",
  );
  let pk = pkInput.trim();
  if (!pk.startsWith("0x")) pk = `0x${pk}`;
  const privateKey = pk as Hex;

  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  if (mode === "wrap") {
    const wrapAmountEth =
      (await rl.question(
        "How much ETH to wrap into WETH? (e.g. 0.1, 0.2): ",
      )) || "0.1";

    const value = parseEther(wrapAmountEth);
    console.log("\n=== Wrap-only mode ===");
    console.log("RPC:", rpcUrl);
    console.log("Account:", account.address);
    console.log("WETH address:", WETH_ADDRESS);
    console.log(`\nWrapping ${wrapAmountEth} ETH into WETH...`);

    const wrapHash = await walletClient.writeContract({
      address: WETH_ADDRESS,
      abi: wethAbi,
      functionName: "deposit",
      args: [],
      value,
    });
    console.log("  wrap tx hash:", wrapHash);
    await publicClient.waitForTransactionReceipt({ hash: wrapHash });
    console.log("  wrap confirmed.");
    rl.close();
    return;
  }

  const feeInput = await rl.question(
    "Fee tier in bps (500 / 3000 / 10000) [default 10000]: ",
  );
  const feeTier =
    (feeInput.trim() === "" ? 10000 : Number(feeInput.trim())) || 10000;

  const tokenAddressInput = await rl.question(
    "Existing ERC-20 token address on Sepolia (0x...): ",
  );
  const tokenAddress = tokenAddressInput.trim() as Address;

  let targetTokensPerWethStr = "1";
  if (mode === "init") {
    targetTokensPerWethStr =
      (await rl.question(
        "Target price: how many TOKEN (your ERC-20) per 1 WETH? (e.g. 4000, 5000, default 1): ",
      )) || "1";
  }

  const wrapAnswer = (
    await rl.question("Wrap some Sepolia ETH into WETH for liquidity? (y/N): ")
  )
    .trim()
    .toLowerCase();

  let wrapAmountEth = "0";
  if (wrapAnswer === "y" || wrapAnswer === "yes") {
    wrapAmountEth =
      (await rl.question("How much ETH to wrap into WETH? (default 0.2): ")) ||
      "0.2";
  }

  const amountTokenStr =
    (await rl.question(
      mode === "init"
        ? "Amount of ERC-20 to deposit as initial liquidity (e.g. 400, 5000): "
        : "Amount of ERC-20 to deposit as additional liquidity (e.g. 400, 5000): ",
    )) || "400";

  const amountWethStr =
    (await rl.question(
      mode === "init"
        ? "Amount of WETH to deposit as initial liquidity (e.g. 0.2): "
        : "Amount of WETH to deposit as additional liquidity (e.g. 0.2): ",
    )) || "0.2";

  rl.close();

  console.log("\n=== Config ===");
  console.log("Mode:", mode === "init" ? "INIT" : "ADD");
  console.log("RPC:", rpcUrl);
  console.log("Fee tier (bps):", feeTier);
  console.log("Account:", account.address);
  console.log("Token address (your ERC-20):", tokenAddress);
  console.log("WETH address:", WETH_ADDRESS);
  console.log("NPM address:", NPM_ADDRESS);

  const tokenLower = tokenAddress.toLowerCase();
  const wethLower = WETH_ADDRESS.toLowerCase();

  const [token0, token1]: [Address, Address] =
    tokenLower < wethLower
      ? [tokenAddress, WETH_ADDRESS]
      : [WETH_ADDRESS, tokenAddress];

  if (wrapAmountEth !== "0") {
    const value = parseEther(wrapAmountEth);
    console.log(`\nWrapping ${wrapAmountEth} ETH into WETH...`);
    const wrapHash = await walletClient.writeContract({
      address: WETH_ADDRESS,
      abi: wethAbi,
      functionName: "deposit",
      args: [],
      value,
    });
    console.log("  wrap tx hash:", wrapHash);
    await publicClient.waitForTransactionReceipt({ hash: wrapHash });
    console.log("  wrap confirmed.");
  }

  if (mode === "init") {
    const targetTokensPerWeth = parseFloat(targetTokensPerWethStr);
    if (!(targetTokensPerWeth > 0)) {
      throw new Error("Invalid target price input.");
    }

    const price =
      token0.toLowerCase() === tokenAddress.toLowerCase()
        ? 1 / targetTokensPerWeth // WETH per TOKEN
        : targetTokensPerWeth; // TOKEN per WETH

    const sqrtPriceX96 = encodePriceSqrt(price);

    console.log(
      `\nInitializing pool at target price ~${targetTokensPerWeth} TOKEN per 1 WETH`,
    );
    console.log("token0:", token0);
    console.log("token1:", token1);
    console.log("sqrtPriceX96:", sqrtPriceX96.toString());

    const initHash = await walletClient.writeContract({
      address: NPM_ADDRESS,
      abi: npmAbi,
      functionName: "createAndInitializePoolIfNecessary",
      args: [token0, token1, feeTier, sqrtPriceX96],
    });
    console.log("  init tx hash:", initHash);
    const initReceipt = await publicClient.waitForTransactionReceipt({
      hash: initHash,
    });
    console.log("  init confirmed, block:", initReceipt.blockNumber);
  } else {
    console.log(
      "\nSkipping pool initialization, assuming pool already exists for this fee tier.",
    );
  }

  console.log("\nApproving NPM for both tokens (unlimited)...");
  const maxUint256 = (2n ** 256n - 1n) as bigint;

  const approveToken0Hash = await walletClient.writeContract({
    address: token0,
    abi: erc20Abi,
    functionName: "approve",
    args: [NPM_ADDRESS, maxUint256],
  });
  console.log("  approve token0 tx:", approveToken0Hash);
  await publicClient.waitForTransactionReceipt({ hash: approveToken0Hash });

  const approveToken1Hash = await walletClient.writeContract({
    address: token1,
    abi: erc20Abi,
    functionName: "approve",
    args: [NPM_ADDRESS, maxUint256],
  });
  console.log("  approve token1 tx:", approveToken1Hash);
  await publicClient.waitForTransactionReceipt({ hash: approveToken1Hash });
  console.log("  approvals confirmed.");

  const amount0Desired = parseEther(
    token0.toLowerCase() === tokenAddress.toLowerCase()
      ? amountTokenStr
      : amountWethStr,
  );
  const amount1Desired = parseEther(
    token1.toLowerCase() === tokenAddress.toLowerCase()
      ? amountTokenStr
      : amountWethStr,
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  console.log(
    `\nMinting ${
      mode === "init" ? "initial" : "additional"
    } wide-range liquidity...`,
  );
  const mintHash = await walletClient.writeContract({
    address: NPM_ADDRESS,
    abi: npmAbi,
    functionName: "mint",
    args: [
      {
        token0,
        token1,
        fee: feeTier,
        tickLower: TICK_LOWER,
        tickUpper: TICK_UPPER,
        amount0Desired,
        amount1Desired,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: account.address as Address,
        deadline,
      },
    ],
  });
  console.log("  mint tx hash:", mintHash);
  const mintReceipt = await publicClient.waitForTransactionReceipt({
    hash: mintHash,
  });
  console.log("  mint confirmed, block:", mintReceipt.blockNumber);

  console.log(
    `\nDone. Liquidity ${
      mode === "init" ? "initialized and added." : "added to existing pool."
    }`,
  );
}

main().catch((err) => {
  console.error("Error running CLI:", err);
  process.exit(1);
});
