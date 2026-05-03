"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import {
  ARC_CHAIN_ID,
  getArcUsdcBalance,
  getWalletChainId,
  requestWalletAccounts,
  safeNumberLabel,
  sendArcUsdc,
  shortenAddress,
  switchToArcTestnet,
  type WalletState
} from "@/lib/arc";
import { getAssistantReply, parseIntent, type ParsedIntent } from "@/lib/intent";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  intent?: ParsedIntent;
};

const starterPrompts = [
  "What is my Arc USDC balance?",
  "Send 1 USDC to 0x0000000000000000000000000000000000000000",
  "How does ArcPilot protect my funds?",
  "Bridge 10 USDC from Base to Arc",
  "Swap 5 USDC to EURC",
  "Find conservative yield ideas for USDC"
];

const productCards = [
  {
    label: "Network",
    value: "Arc",
    detail: "Testnet-ready wallet flow"
  },
  {
    label: "Primary asset",
    value: "USDC",
    detail: "Gas + payment UX"
  },
  {
    label: "Execution",
    value: "User-signed",
    detail: "No silent transactions"
  }
];

const riskChecks = [
  "Network must be Arc Testnet",
  "Recipient must be a valid 0x address",
  "Amount must be greater than zero",
  "Wallet asks for signature before funds move",
  "Explorer receipt is shown after execution"
];

const modules = [
  ["Send", "Live USDC transfer on Arc Testnet"],
  ["Swap", "USDC ↔ EURC route preview"],
  ["Bridge", "Crosschain USDC planning"],
  ["Yield", "Strategy ideas with safety limits"]
];

const initialMessages: Message[] = [
  {
    id: "m-1",
    role: "assistant",
    content:
      "Welcome to ArcPilot. Tell me what you want to do on Arc: check balance, send USDC, plan a bridge, review risk, or learn how a transaction works."
  }
];

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ArcPilotApp() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    shortAddress: "Not connected",
    isArc: false,
    chainId: null,
    balance: "0"
  });

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [transferAmount, setTransferAmount] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastTxUrl, setLastTxUrl] = useState("");

  const canSend = useMemo(() => {
    return Boolean(
      wallet.address &&
        wallet.isArc &&
        recipient &&
        isAddress(recipient) &&
        transferAmount &&
        Number(transferAmount) > 0
    );
  }, [wallet.address, wallet.isArc, recipient, transferAmount]);

  async function refreshWallet(addressOverride?: `0x${string}`) {
    if (!window.ethereum) {
      return;
    }

    const address = addressOverride ?? wallet.address;

    if (!address) {
      return;
    }

    const chainId = await getWalletChainId();
    const isArc = chainId === ARC_CHAIN_ID;
    let balance = "0";

    if (isArc) {
      balance = await getArcUsdcBalance(address);
    }

    setWallet({
      address,
      shortAddress: shortenAddress(address),
      chainId,
      isArc,
      balance
    });
  }

  async function connectWallet() {
    try {
      setBusy(true);
      setStatus("Opening wallet…");

      const address = await requestWalletAccounts();
      const chainId = await getWalletChainId();

      setWallet({
        address,
        shortAddress: shortenAddress(address),
        chainId,
        isArc: chainId === ARC_CHAIN_ID,
        balance: "0"
      });

      if (chainId !== ARC_CHAIN_ID) {
        setStatus("Wallet connected. Switch to Arc Testnet to continue.");
        return;
      }

      const balance = await getArcUsdcBalance(address);

      setWallet({
        address,
        shortAddress: shortenAddress(address),
        chainId,
        isArc: true,
        balance
      });

      setStatus("Wallet connected to Arc Testnet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchNetwork() {
    try {
      setBusy(true);
      setStatus("Switching wallet to Arc Testnet…");

      await switchToArcTestnet();

      if (wallet.address) {
        await refreshWallet(wallet.address);
      }

      setStatus("Wallet switched to Arc Testnet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Network switch failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshBalance() {
    try {
      setBusy(true);
      setStatus("Refreshing Arc balance…");

      await refreshWallet();

      setStatus("Balance refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not refresh balance.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!wallet.address) {
      setStatus("Connect your wallet first.");
      return;
    }

    if (!wallet.isArc) {
      setStatus("Switch to Arc Testnet before sending.");
      return;
    }

    if (!isAddress(recipient)) {
      setStatus("Enter a valid recipient wallet address.");
      return;
    }

    try {
      setBusy(true);
      setLastTxUrl("");
      setStatus("Preparing USDC transfer. Confirm in your wallet…");

      const result = await sendArcUsdc({
        from: wallet.address,
        to: recipient,
        amount: transferAmount
      });

      setLastTxUrl(result.explorerUrl);
      setStatus(
        result.status === "success"
          ? "Transfer confirmed on Arc Testnet."
          : "Transaction submitted but was not successful."
      );

      await refreshWallet(wallet.address);

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "system",
          content: `Receipt ready: ${transferAmount} USDC transfer submitted.`
        },
        {
          id: createId(),
          role: "assistant",
          content: `Your transfer was sent. Explorer receipt: ${result.explorerUrl}`
        }
      ]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Transfer failed.");
    } finally {
      setBusy(false);
    }
  }

  function submitPrompt(event?: FormEvent<HTMLFormElement>, forcedPrompt?: string) {
    event?.preventDefault();

    const prompt = forcedPrompt ?? input;
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      return;
    }

    const intent = parseIntent(cleanPrompt);

    if (intent.kind === "send") {
      if (intent.amount) {
        setTransferAmount(intent.amount);
      }

      if (intent.recipient) {
        setRecipient(intent.recipient);
      }
    }

    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: "user",
        content: cleanPrompt
      },
      {
        id: createId(),
        role: "assistant",
        content: getAssistantReply(intent),
        intent
      }
    ]);

    setInput("");
  }

  useEffect(() => {
    if (!window.ethereum?.on) {
      return;
    }

    const onAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      const next = list[0];

      if (!next || !isAddress(next)) {
        setWallet({
          address: null,
          shortAddress: "Not connected",
          chainId: null,
          isArc: false,
          balance: "0"
        });
        return;
      }

      void refreshWallet(next as `0x${string}`);
    };

    const onChainChanged = () => {
      void refreshWallet();
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [wallet.address]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#07080d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(70,136,255,0.28),transparent_30%),radial-gradient(circle_at_78%_8%,rgba(129,83,255,0.22),transparent_28%),radial-gradient(circle_at_70%_86%,rgba(0,228,168,0.16),transparent_25%)]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 md:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.25)]">
              <span className="text-xl font-black">A</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.28em] text-white/45 md:text-sm">
                ARCPILOT
              </p>
              <h1 className="truncate text-base font-semibold md:text-lg">
                AI Crypto Copilot on Arc
              </h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              Arc Testnet
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">
              USDC gas
            </span>
          </div>

          <button
            onClick={wallet.address ? handleRefreshBalance : connectWallet}
            disabled={busy}
            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {wallet.address ? wallet.shortAddress : "Connect"}
          </button>
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="flex flex-col gap-5">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mb-5 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                Intent → Risk Check → Wallet Signature → Receipt
              </div>

              <h2 className="max-w-xl text-5xl font-semibold leading-[0.95] tracking-[-0.06em] md:text-6xl">
                Make Arc feel like typing a message.
              </h2>

              <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
                ArcPilot turns plain-language crypto requests into clear,
                reviewable actions. It connects to Arc Testnet, reads USDC
                balance, prepares transfers, and explains safety checks before
                the wallet signs.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {productCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-3xl border border-white/10 bg-black/20 p-4"
                  >
                    <p className="text-xs text-white/45">{card.label}</p>
                    <p className="mt-2 text-xl font-semibold">{card.value}</p>
                    <p className="mt-1 text-xs text-white/45">{card.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-[#10121b]/80 p-5 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                    Wallet
                  </p>
                  <h3 className="text-xl font-semibold">Arc control panel</h3>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs ${
                    wallet.isArc
                      ? "bg-emerald-400/10 text-emerald-200"
                      : "bg-amber-400/10 text-amber-200"
                  }`}
                >
                  {wallet.isArc ? "Ready" : "Not on Arc"}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-3xl bg-black/25 p-4">
                  <p className="text-xs text-white/45">Connected address</p>
                  <p className="mt-1 break-all font-mono text-sm">
                    {wallet.address ?? "Connect wallet to continue"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-black/25 p-4">
                    <p className="text-xs text-white/45">Chain ID</p>
                    <p className="mt-1 text-lg font-semibold">
                      {wallet.chainId ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-3xl bg-black/25 p-4">
                    <p className="text-xs text-white/45">USDC balance</p>
                    <p className="mt-1 text-lg font-semibold">
                      {safeNumberLabel(wallet.balance)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={connectWallet}
                    disabled={busy}
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Connect wallet
                  </button>
                  <button
                    onClick={handleSwitchNetwork}
                    disabled={busy}
                    className="rounded-2xl bg-[#8d7dff] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#a69aff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Switch to Arc
                  </button>
                </div>

                {status ? (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/65">
                    {status}
                  </p>
                ) : null}

                {lastTxUrl ? (
                  <a
                    href={lastTxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15"
                  >
                    Open transaction receipt
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                Risk shield
              </p>
              <h3 className="mt-2 text-xl font-semibold">Before funds move</h3>
              <div className="mt-4 grid gap-2">
                {riskChecks.map((check) => (
                  <div
                    key={check}
                    className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/70"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-xs text-emerald-200">
                      ✓
                    </span>
                    {check}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[720px] flex-col rounded-[34px] border border-white/10 bg-[#0d0f17]/90 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                  Copilot
                </p>
                <h3 className="text-2xl font-semibold tracking-[-0.03em]">
                  Ask. Review. Execute.
                </h3>
              </div>
              <div className="hidden rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/55 sm:block">
                Live action: Send USDC
              </div>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-[1fr_320px]">
              <div className="flex min-h-[560px] flex-col rounded-[28px] border border-white/10 bg-black/20">
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 ${
                          message.role === "user"
                            ? "bg-white text-black"
                            : message.role === "system"
                              ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                              : "border border-white/10 bg-white/[0.07] text-white/72"
                        }`}
                      >
                        <p>{message.content}</p>

                        {message.intent ? (
                          <div className="mt-3 rounded-2xl bg-black/20 p-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="uppercase tracking-[0.18em] text-white/40">
                                Intent
                              </span>
                              <span className="text-white/55">
                                {Math.round(message.intent.confidence * 100)}%
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/55">
                              <span>Type: {message.intent.kind}</span>
                              <span>Token: {message.intent.token ?? "—"}</span>
                              <span>Amount: {message.intent.amount ?? "—"}</span>
                              <span>
                                Recipient:{" "}
                                {message.intent.recipient
                                  ? `${message.intent.recipient.slice(0, 6)}…`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 p-4">
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => submitPrompt(undefined, prompt)}
                        className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white/60 transition hover:bg-white/[0.1]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={submitPrompt} className="flex gap-2">
                    <input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Ask: Send 1 USDC to 0x…"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/25"
                    />
                    <button
                      type="submit"
                      className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                    >
                      Ask
                    </button>
                  </form>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                    Execute
                  </p>
                  <h4 className="mt-2 text-xl font-semibold">USDC transfer</h4>

                  <label className="mt-4 block text-xs text-white/45">
                    Amount
                  </label>
                  <input
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-white/25"
                  />

                  <label className="mt-4 block text-xs text-white/45">
                    Recipient
                  </label>
                  <input
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="0x..."
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-white/25"
                  />

                  <button
                    onClick={handleSend}
                    disabled={!canSend || busy}
                    className="mt-4 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Execute with wallet
                  </button>

                  <p className="mt-3 text-xs leading-5 text-white/45">
                    ArcPilot never moves funds alone. Your wallet must show and
                    approve every transaction.
                  </p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-[#151722] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                    Modules
                  </p>

                  <div className="mt-4 space-y-3">
                    {modules.map(([title, description]) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-white/10 bg-black/20 p-3"
                      >
                        <p className="text-sm font-semibold">{title}</p>
                        <p className="mt-1 text-xs text-white/45">
                          {description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                    Build note
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/58">
                    Send is live. Swap, bridge, and yield are safe planning
                    modules until Arc App Kit credentials and production risk
                    controls are added.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
