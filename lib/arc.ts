import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits
} from "viem";

export const ARC_CHAIN_ID = 5042002;
export const ARC_CHAIN_ID_HEX = "0x4cef52";

export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";

export const ARC_USDC_ERC20 =
  "0x3600000000000000000000000000000000000000" as const;

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [ARC_RPC_URL],
      webSocket: ["wss://rpc.testnet.arc.network"]
    }
  },
  blockExplorers: {
    default: {
      name: "ArcScan Testnet",
      url: ARC_EXPLORER_URL
    }
  },
  testnet: true
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL)
});

export type WalletState = {
  address: `0x${string}` | null;
  shortAddress: string;
  isArc: boolean;
  chainId: number | null;
  balance: string;
};

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function safeNumberLabel(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "0.0000";
  }

  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: 6
  });
}

export async function requestWalletAccounts() {
  if (!window.ethereum) {
    throw new Error(
      "No wallet found. Install MetaMask, Rabby, Coinbase Wallet, or another injected wallet."
    );
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts"
  })) as string[];

  const first = accounts[0];

  if (!first || !isAddress(first)) {
    throw new Error("No valid wallet account returned.");
  }

  return first as `0x${string}`;
}

export async function getWalletChainId() {
  if (!window.ethereum) {
    throw new Error("No wallet found.");
  }

  const chainId = (await window.ethereum.request({
    method: "eth_chainId"
  })) as string;

  return Number.parseInt(chainId, 16);
}

export async function switchToArcTestnet() {
  if (!window.ethereum) {
    throw new Error("No wallet found.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_CHAIN_ID_HEX }]
    });
  } catch (error) {
    const maybeError = error as { code?: number };

    if (maybeError.code !== 4902) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: ARC_CHAIN_ID_HEX,
          chainName: "Arc Testnet",
          nativeCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 18
          },
          rpcUrls: [ARC_RPC_URL],
          blockExplorerUrls: [ARC_EXPLORER_URL]
        }
      ]
    });
  }
}

export async function getArcUsdcBalance(address: `0x${string}`) {
  const decimals = await publicClient.readContract({
    address: ARC_USDC_ERC20,
    abi: erc20Abi,
    functionName: "decimals"
  });

  const balance = await publicClient.readContract({
    address: ARC_USDC_ERC20,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address]
  });

  return formatUnits(balance, decimals);
}

export async function sendArcUsdc({
  from,
  to,
  amount
}: {
  from: `0x${string}`;
  to: string;
  amount: string;
}) {
  if (!window.ethereum) {
    throw new Error("No wallet found.");
  }

  if (!isAddress(to)) {
    throw new Error("Recipient must be a valid 0x wallet address.");
  }

  const safeAmount = amount.trim();

  if (!safeAmount || Number(safeAmount) <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  const walletClient = createWalletClient({
    account: from,
    chain: arcTestnet,
    transport: custom(window.ethereum)
  });

  const hash = await walletClient.writeContract({
    address: ARC_USDC_ERC20,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to as `0x${string}`, parseUnits(safeAmount, 6)]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    hash,
    explorerUrl: `${ARC_EXPLORER_URL}/tx/${hash}`,
    status: receipt.status
  };
}
