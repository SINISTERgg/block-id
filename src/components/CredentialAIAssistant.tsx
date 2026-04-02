import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Send, ChevronDown, ChevronUp, Sparkles,
  ShieldCheck, ShieldAlert, ShieldX, Bot, User,
  TrendingUp, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AIAnalysisResult,
  VerificationContext,
  ChatMessage,
  chatWithAI,
  getRiskColor,
  getRiskBg,
  getDimensionColor,
  getStatusIcon,
} from "@/services/ai/credential-ai.service";

interface Props {
  analysis: AIAnalysisResult;
  verificationContext: VerificationContext;
  className?: string;
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
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
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
}

// ─── Dimension Bar ────────────────────────────────────────────────────────────

function DimensionBar({ dim, delay }: { dim: AIAnalysisResult["dimensions"][0]; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  const bg = getDimensionColor(dim.score);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <span className="text-sm w-4 flex-shrink-0">{getStatusIcon(dim.status)}</span>
        <span className="text-xs font-medium text-foreground flex-1 truncate">{dim.name}</span>
        <span className="text-xs text-muted-foreground font-mono w-8 text-right">{dim.score}</span>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </button>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${bg}`}
          initial={{ width: 0 }}
          animate={{ width: `${dim.score}%` }}
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
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-verifier text-white rounded-tr-none"
            : "bg-muted text-foreground rounded-tl-none"
        }`}
        dangerouslySetInnerHTML={{
          __html: msg.content
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/`(.*?)`/g, `<code class="bg-background/50 px-0.5 rounded font-mono">$1</code>`)
            .replace(/\n/g, "<br/>"),
        }}
      />
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CredentialAIAssistant({ analysis, verificationContext, className = "" }: Props) {
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `👋 Hi! I'm the **BlockID Credential AI** (${analysis.engine === "gemini-enhanced-v1" ? "powered by Gemini" : "Heuristic Engine"}). Ask me anything about this verification result.`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const riskColor = getRiskColor(analysis.risk_level);
  const riskBg = getRiskBg(analysis.risk_level);
  const RiskIcon = analysis.risk_level === "low" ? ShieldCheck : analysis.risk_level === "medium" ? ShieldAlert : ShieldX;

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate slight typing delay for UX
    setTimeout(() => {
      const response = chatWithAI(trimmed, verificationContext);
      setMessages(prev => [...prev, { role: "assistant", content: response, timestamp: new Date() }]);
      setIsTyping(false);
    }, 400);
  }, [input, verificationContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Suggested prompts
  const suggestions = [
    "Is this credential valid?",
    "What's the risk level?",
    "Is it on the blockchain?",
    "When does it expire?",
  ];

  return (
    <Card className={`border-primary/20 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <span>AI Verification Analysis</span>
          {analysis.engine === "gemini-enhanced-v1" && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              Gemini Enhanced
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Overview Row ── */}
        <div className="flex items-center gap-4">
          <ScoreRing score={analysis.score} />
          <div className="flex-1 space-y-2">
            {/* Risk badge */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${riskBg}`}>
              <RiskIcon className={`h-3.5 w-3.5 ${riskColor}`} />
              <span className={riskColor}>{analysis.risk_level.toUpperCase()} RISK</span>
            </div>
            {/* Confidence bar */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>AI Confidence</span>
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
            </div>
            <p className="text-[10px] text-muted-foreground">
              Engine: <span className="font-mono">{analysis.engine}</span>
            </p>
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
        >
          <Bot className="h-3.5 w-3.5 text-primary" />
          {showChat ? "Hide AI Chat" : "Ask AI about this credential"}
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
              {/* Messages */}
              <div
                ref={scrollRef}
                className="h-52 overflow-y-auto space-y-3 pr-1 scrollbar-thin"
              >
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

              {/* Suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); }}
                    className="text-[10px] px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors bg-background"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about this credential..."
                  className="text-xs h-8"
                  id="ai-chat-input"
                />
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={sendMessage}
                  disabled={!input.trim() || isTyping}
                  variant="verifier"
                  id="ai-chat-send"
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
