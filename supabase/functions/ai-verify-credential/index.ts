// @ts-nocheck
// Supabase Edge Function: ai-verify-credential
// Called after a holder accepts a verification request.
// Runs Gemini AI to auto-verify the credential and updates the request with the verdict.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { request_id, credential_data, request_purpose, credential_type } = await req.json();

    if (!request_id || !credential_data) {
      return new Response(JSON.stringify({ error: "request_id and credential_data are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vc = typeof credential_data === "string" ? JSON.parse(credential_data) : credential_data;
    const subject = vc?.credentialSubject || {};
    const issuer = vc?.issuer || "unknown";
    const issuanceDate = vc?.issuanceDate || null;
    const expirationDate = vc?.expirationDate || null;
    const credType = credential_type || (Array.isArray(vc?.type) ? vc.type.join(", ") : "Unknown");

    // ── Rule-based checks (always run, no API needed) ─────────────────────────
    const checks: { label: string; pass: boolean; detail: string }[] = [];

    const now = new Date();

    // 1. Not expired
    if (expirationDate) {
      const expired = new Date(expirationDate) < now;
      checks.push({ label: "Expiry", pass: !expired, detail: expired ? `Expired on ${expirationDate}` : `Valid until ${expirationDate}` });
    } else {
      checks.push({ label: "Expiry", pass: true, detail: "No expiration date set" });
    }

    // 2. Has issuer
    checks.push({ label: "Issuer", pass: !!issuer && issuer !== "unknown", detail: issuer ? `Issued by ${issuer}` : "No issuer found" });

    // 3. Has issuance date
    checks.push({ label: "Issuance Date", pass: !!issuanceDate, detail: issuanceDate ? `Issued on ${issuanceDate}` : "Missing issuance date" });

    // 4. Credential subject present
    const hasSubject = Object.keys(subject).length > 0;
    checks.push({ label: "Credential Subject", pass: hasSubject, detail: hasSubject ? `${Object.keys(subject).length} field(s) present` : "Empty credential subject" });

    // 5. Type match (if request specifies a type)
    if (credential_type) {
      const typeMatch = credType.toLowerCase().includes(credential_type.toLowerCase());
      checks.push({ label: "Type Match", pass: typeMatch, detail: typeMatch ? `Credential type matches: ${credType}` : `Type mismatch: got "${credType}", expected "${credential_type}"` });
    }

    const ruleScore = checks.filter(c => c.pass).length / checks.length;

    // ── Gemini AI enhancement ─────────────────────────────────────────────────
    let aiSummary = "";
    let aiConfidence = ruleScore;
    let aiVerdict: "verified" | "rejected" | "review" = ruleScore >= 0.8 ? "verified" : ruleScore >= 0.5 ? "review" : "rejected";
    let engine = "rule-based";

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (GEMINI_API_KEY) {
      try {
        const prompt = `You are a credential verification AI for a decentralized identity system.

Analyze the following Verifiable Credential and respond with a JSON object.

Credential type: ${credType}
Verifier's purpose: ${request_purpose || "Not specified"}
Issuer: ${issuer}
Issuance date: ${issuanceDate || "Not provided"}
Expiration date: ${expirationDate || "No expiration"}
Subject fields: ${JSON.stringify(subject, null, 2)}

Rule-based checks:
${checks.map(c => `- ${c.label}: ${c.pass ? "PASS" : "FAIL"} — ${c.detail}`).join("\n")}

Respond ONLY with this JSON (no markdown, no explanation):
{
  "verdict": "verified" | "rejected" | "review",
  "confidence": <number 0.0-1.0>,
  "summary": "<one sentence human-readable summary of your decision>",
  "flags": ["<any concerns>"]
}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          // Strip markdown fences if present
          const jsonText = rawText.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
          const parsed = JSON.parse(jsonText);
          aiVerdict = parsed.verdict ?? aiVerdict;
          aiConfidence = parsed.confidence ?? aiConfidence;
          aiSummary = parsed.summary ?? "";
          engine = "gemini";
        }
      } catch (geminiErr) {
        console.warn("Gemini AI failed, using rule-based result:", geminiErr);
      }
    }

    if (!aiSummary) {
      const passing = checks.filter(c => c.pass).map(c => c.label);
      const failing = checks.filter(c => !c.pass).map(c => c.label);
      aiSummary = aiVerdict === "verified"
        ? `Credential passes all checks: ${passing.join(", ")}.`
        : `Credential has issues: ${failing.join(", ")}. ${passing.length > 0 ? `Passing: ${passing.join(", ")}.` : ""}`;
    }

    const aiResult = {
      verdict: aiVerdict,
      confidence: aiConfidence,
      summary: aiSummary,
      checks,
      engine,
      evaluated_at: new Date().toISOString(),
    };

    // ── Update the verification request in DB ─────────────────────────────────
    const newStatus = aiVerdict === "verified" ? "verified" : aiVerdict === "rejected" ? "rejected" : "accepted";
    await supabase
      .from("verification_requests")
      .update({
        status: newStatus,
        ai_analysis: aiResult,
        verified_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return new Response(JSON.stringify(aiResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-verify-credential error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
