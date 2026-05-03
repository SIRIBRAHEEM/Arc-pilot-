export type IntentKind =
  | "send"
  | "swap"
  | "bridge"
  | "balance"
  | "yield"
  | "risk"
  | "learn"
  | "unknown";

export type ParsedIntent = {
  kind: IntentKind;
  confidence: number;
  amount?: string;
  token?: string;
  recipient?: string;
  title: string;
  summary: string;
  nextStep: string;
};

const walletPattern = /(0x[a-fA-F0-9]{40})/;

function pickToken(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("eurc")) {
    return "EURC";
  }

  if (lower.includes("usdt")) {
    return "USDT";
  }

  if (lower.includes("eth")) {
    return "ETH";
  }

  return "USDC";
}

export function parseIntent(input: string): ParsedIntent {
  const text = input.trim();
  const lower = text.toLowerCase();

  const amountMatch = lower.match(/(\d+(?:\.\d+)?)/);
  const recipientMatch = text.match(walletPattern);
  const token = pickToken(text);

  if (lower.includes("send") || lower.includes("transfer") || lower.includes("pay")) {
    return {
      kind: "send",
      confidence: recipientMatch ? 0.94 : 0.72,
      amount: amountMatch?.[1],
      token,
      recipient: recipientMatch?.[1],
      title: "Send intent detected",
      summary:
        "I found a payment instruction. ArcPilot can prepare a USDC transfer on Arc Testnet using the Arc USDC ERC-20 interface.",
      nextStep: recipientMatch
        ? "Review the amount and recipient, then execute from your wallet."
        : "Add a valid 0x recipient address so the transfer can be prepared."
    };
  }

  if (
    lower.includes("balance") ||
    lower.includes("portfolio") ||
    lower.includes("wallet")
  ) {
    return {
      kind: "balance",
      confidence: 0.91,
      title: "Portfolio check",
      summary:
        "I can read your Arc Testnet USDC balance after your wallet is connected.",
      nextStep: "Connect your wallet or refresh your balance."
    };
  }

  if (
    lower.includes("swap") ||
    lower.includes("convert") ||
    lower.includes("exchange")
  ) {
    return {
      kind: "swap",
      confidence: 0.84,
      amount: amountMatch?.[1],
      token,
      title: "Swap route planned",
      summary:
        "This looks like a token swap request. Arc App Kit can power live USDC and EURC swap flows when a Circle Kit key is connected.",
      nextStep:
        "This demo plans the route only. Add Arc App Kit before enabling live swaps."
    };
  }

  if (lower.includes("bridge") || lower.includes("cross-chain")) {
    return {
      kind: "bridge",
      confidence: 0.86,
      amount: amountMatch?.[1],
      token,
      title: "Bridge route planned",
      summary:
        "This looks like a crosschain transfer request. Arc App Kit can abstract bridge flows across supported chains.",
      nextStep:
        "This demo plans the bridge only. Add Arc App Kit before enabling live bridge execution."
    };
  }

  if (
    lower.includes("yield") ||
    lower.includes("earn") ||
    lower.includes("apy") ||
    lower.includes("returns") ||
    lower.includes("stake") ||
    lower.includes("staking")
  ) {
    return {
      kind: "yield",
      confidence: 0.82,
      title: "Yield strategy request",
      summary:
        "I can help compare stablecoin strategy ideas, but this demo will not auto-deploy funds into third-party protocols.",
      nextStep:
        "For production, require protocol allowlists, simulation, risk scoring, and explicit user approval."
    };
  }

  if (
    lower.includes("risk") ||
    lower.includes("safe") ||
    lower.includes("protect") ||
    lower.includes("hack") ||
    lower.includes("security") ||
    lower.includes("scam")
  ) {
    return {
      kind: "risk",
      confidence: 0.9,
      title: "Risk shield",
      summary:
        "ArcPilot checks network, recipient format, amount, and wallet confirmation before any transaction is sent.",
      nextStep:
        "For production, add simulation, allowlists, spending limits, and compliance checks."
    };
  }

  if (
    lower.includes("learn") ||
    lower.includes("explain") ||
    lower.includes("what is") ||
    lower.includes("how")
  ) {
    return {
      kind: "learn",
      confidence: 0.8,
      title: "Learning mode",
      summary:
        "I can explain Arc, USDC gas, stablecoin transfers, bridging, and transaction receipts in plain language.",
      nextStep:
        "Ask about Arc gas, USDC transfers, wallet safety, or finality."
    };
  }

  return {
    kind: "unknown",
    confidence: 0.42,
    title: "Intent not clear yet",
    summary:
      "Try a direct command like: “Send 1 USDC to 0x…”, “What is my balance?”, or “How does ArcPilot protect my funds?”",
    nextStep: "Make the action more specific."
  };
}

export function getAssistantReply(intent: ParsedIntent) {
  return `${intent.title}. ${intent.summary} ${intent.nextStep}`;
}
