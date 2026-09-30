import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Send, ChevronDown, ChevronUp,
  ShieldCheck, ShieldAlert, ShieldX, Bot, User,
  TrendingUp, Info, Cpu, AlertTriangle, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRiskColor,
  getRiskBg,
  getDimensionColor,
  getStatusIcon,
  renderAssistantMarkdown,
  askAssistant,
  type NormalizedAnalysis,
  type VerificationContext,
  type ChatMessage,
} from "@/services/ai/credential-ai.service";

interface Props {
  analysis: NormalizedAnalysis;
  verificationContext: VerificationContext;
  className?: string;
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, capped }: { score: number; capped: boolean }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="90" height="90" className="-rotate-90">
        <circle cx="45" cy="45" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <motion.circle
          cx="45" cy="45" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold font-display text-foreground leading-none">{score}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
          {capped ? "Capped" : "Score"}
        </span>
      </div>
    </div>
  );
}

// ─── Dimension Bar ────────────────────────────────────────────────────────────

function DimensionBar({ dim, delay }: { dim: NormalizedAnalysis["dimensions"][0]; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  const bg = dim.status === "unknown" ? "bg-slate-400" : getDimensionColor(dim.score);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 text-left group"
        aria-expanded={expanded}
      >
        <span className="text-sm w-4 flex-shrink-0" aria-hidden>{getStatusIcon(dim.status)}</span>
        <span className="text-xs font-medium text-foreground flex-1 truncate">{dim.name}</span>
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
          {dim.status === "unknown" ? "—" : dim.score}
        </span>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </button>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${bg}`}
          initial={{ width: 0 }}
          animate={{ width: dim.status === "unknown" ? "0%" : `${dim.score}%` }}
          transition={{ duration: 0.8, delay, ease: "easeOut" }}
        />
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs text-muted-foreground pl-6 pb-1 leading-relaxed"
          >
            {dim.detail}
            <span className="block mt-1 text-[10px] font-mono opacity-70">
              weight {dim.weight}%
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${isUser ? "bg-verifier text-white" : "bg-primary/10"}`}>
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3 text-primary" />}
      </div>
      <div className="max-w-[85%] space-y-1">
        <div
          className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
            isUser
              ? "bg-verifier text-white rounded-tr-none"
              : "bg-muted text-foreground rounded-tl-none"
          }`}
          // Safe: renderAssistantMarkdown HTML-escapes the entire message before
          // re-introducing only **bold**, `code` and _italic_ markup it controls.
          // Model output and credential text are both user-influenced, so this
          // must never be a raw passthrough.
          dangerouslySetInnerHTML={{ __html: renderAssistantMarkdown(msg.content) }}
        />
        {!isUser && msg.source && (
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground px-1">
            {msg.source === "model" ? (
              <>
                <Cpu className="h-2.5 w-2.5" />
                <span>answered by {msg.model ?? "language model"}</span>
                {typeof msg.latencyMs === "number" && <span>· {msg.latencyMs}ms</span>}
              </>
            ) : (
              <>
                <AlertTriangle className="h-2.5 w-2.5" />
                {/* Say *why* the rules answered. "Rate limited" and "no model
                    configured" call for very different user responses, and
                    collapsing them makes a working feature look broken. */}
                <span>
                  {msg.fallbackReason === "rate_limited"
                    ? `deterministic rules — AI request limit reached${typeof msg.retryAfterSeconds === "number" ? `, retry in ${msg.retryAfterSeconds}s` : ""}`
                    : msg.fallbackReason === "not_configured"
                      ? "deterministic rules — no model configured"
                      : "deterministic rules — model unavailable"}
                </span>
              </>
            )}
          </div>
        )}
        {!isUser && msg.referencedDimensions && msg.referencedDimensions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {msg.referencedDimensions.map(d => (
              <span key={d} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {d}
              </span>
            ))}
          </div>
        )}
        {!isUser && msg.followUps && msg.followUps.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1 pt-0.5">
            {msg.followUps.map(f => (
              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CredentialAIAssistant({ analysis, verificationContext, className = "" }: Props) {
  const llmActive = !!analysis.llm && !analysis.llm.degraded;
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `👋 I'm the **BlockID Credential Analyst**. The score below is computed by a deterministic engine; I explain it and can answer questions about it.`,
      timestamp: new Date(),
      source: "rules",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const riskColor = getRiskColor(analysis.risk_level);
  const riskBg = getRiskBg(analysis.risk_level);
  const RiskIcon = analysis.risk_level === "low" ? ShieldCheck : analysis.risk_level === "medium" ? ShieldAlert : ShieldX;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (raw?: string) => {
    const trimmed = (raw ?? input).trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const history = messages.slice(-10);
      const result = await askAssistant(trimmed, verificationContext, history);
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          timestamp: new Date(),
          source: result.source,
          referencedDimensions: result.referencedDimensions,
          followUps: result.followUps,
          degraded: result.degraded,
          latencyMs: result.latencyMs,
          model: result.model,
          fallbackReason: result.fallbackReason,
          retryAfterSeconds: result.retryAfterSeconds,
        },
      ]);
    } catch (err) {
      console.error("[BlockID] assistant failed:", err);
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "I could not answer that just now. Try asking about the score breakdown, revocation or the blockchain anchor.",
          timestamp: new Date(),
          source: "rules",
          degraded: true,
          fallbackReason: "unavailable",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [input, messages, isTyping, verificationContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const suggestions = [
    "Is this credential valid?",
    "What's the risk level?",
    "Why is the score what it is?",
    "What should I do next?",
  ];

  return (
    <Card className={`border-primary/20 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <span>Credential Trust Analysis</span>
          {llmActive ? (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
              <Cpu className="h-2.5 w-2.5 text-primary" />
              Narrative by {analysis.llm!.model}
            </span>
          ) : (
            <span
              className="ml-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/60"
              title="No language model is configured. Analysis is fully deterministic."
            >
              <Ban className="h-2.5 w-2.5" />
              Deterministic only
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Overview Row ── */}
        <div className="flex items-center gap-4">
          <ScoreRing score={analysis.score} capped={analysis.hard_caps_applied.length > 0} />
          <div className="flex-1 space-y-2">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${riskBg}`}>
              <RiskIcon className={`h-3.5 w-3.5 ${riskColor}`} />
              <span className={riskColor}>{analysis.risk_level.toUpperCase()} RISK</span>
              <span className="text-[10px] font-normal text-muted-foreground border-l border-current/20 pl-1.5 ml-0.5">
                {analysis.tier}
              </span>
            </div>

            {/* Confidence — evidence coverage, with its reasons exposed */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span title="How much of the available evidence we actually gathered. Independent of the outcome.">
                  Confidence
                </span>
                <span>{analysis.confidence}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${analysis.confidence}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
              {analysis.confidence_factors.length > 0 && (
                <p className="text-[9px] text-muted-foreground leading-snug">
                  Reduced by: {analysis.confidence_factors.map(f => f.label.toLowerCase()).join("; ")}
                </p>
              )}
            </div>

            {analysis.hard_caps_applied.length > 0 && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 space-y-0.5">
                {analysis.hard_caps_applied.map(c => (
                  <p key={c.key} className="text-[10px] text-red-400 leading-snug">
                    <span className="font-mono">cap {c.cap}/100</span> — {c.reason}
                  </p>
                ))}
                {analysis.raw_score !== analysis.score && (
                  <p className="text-[10px] text-muted-foreground">
                    Signal mix scored {analysis.raw_score}/100 before caps.
                  </p>
                )}
              </div>
            )}

            {analysis.legacy && (
              <p className="text-[9px] text-amber-500/80">
                Legacy record — predates the current engine, so the breakdown below was not stored.
              </p>
            )}
          </div>
        </div>

        {/* ── Dimension Bars ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Dimension Breakdown
            <span className="text-[10px] ml-1">(click to expand)</span>
          </div>
          {analysis.dimensions.map((dim, i) => (
            <DimensionBar key={dim.key} dim={dim} delay={i * 0.06} />
          ))}
        </div>

        {/* ── Recommendations ── */}
        {analysis.recommendations.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Recommendations
            </div>
            <ul className="space-y-1">
              {analysis.recommendations.map((rec, i) => (
                <li key={i} className="text-xs text-foreground/80 flex gap-2">
                  <span className="text-primary flex-shrink-0">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Chat Toggle ── */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 gap-2 border-primary/20 hover:bg-primary/5"
          onClick={() => setShowChat(p => !p)}
          aria-expanded={showChat}
        >
          <Bot className="h-3.5 w-3.5 text-primary" />
          {showChat ? "Hide AI Chat" : "Ask about this credential"}
          {showChat ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </Button>

        {/* ── Chat Interface ── */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div ref={scrollRef} className="h-52 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                {messages.map((msg, i) => (
                  <ChatBubble key={i} msg={msg} />
                ))}
                {isTyping && (
                  <motion.div
                    className="flex items-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-tl-none px-3 py-2 flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => void sendMessage(s)}
                    disabled={isTyping}
                    className="text-[10px] px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors bg-background disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about this credential..."
                  className="text-xs h-8"
                  id="ai-chat-input"
                  maxLength={600}
                />
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || isTyping}
                  variant="verifier"
                  id="ai-chat-send"
                  aria-label="Send question"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
