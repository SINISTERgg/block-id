import { supabase } from "@/services/api/supabaseClient";
import { toGatewayUrl } from "@/lib/ipfs";

export interface IpfsPinResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  pinned_at: string | null;
  already_pinned: boolean;
}

export interface IpfsFetchResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  contentType: string | null;
  sizeBytes: number;
  content: unknown;
}

/**
 * Extract the real error message from a Supabase FunctionsHttpError.
 * When an edge function returns a non-2xx status, supabase-js stores the raw
 * Response in error.context. Reading its JSON gives the actual message the
 * function returned (e.g. "Pinata pinning failed: HTTP 401").
 */
async function extractEdgeFunctionError(error: any, fallback: string): Promise<string> {
  // FunctionsHttpError stores the raw Response in .context
  if (error?.context instanceof Response) {
    try {
      const cloned = error.context.clone();
      const body = await cloned.json();
      if (body?.error && typeof body.error === "string") return body.error;
      if (body?.message && typeof body.message === "string") return body.message;
    } catch {
      // body already consumed or not JSON — fall through
    }
  }
  return error?.message || fallback;
}

/**
 * Pin a credential schema's canonical JSON-LD document to IPFS.
 * Invokes the `pin-to-ipfs` edge function, which persists the CID on the
 * schema row and writes an audit entry.
 */
export async function pinSchemaToIpfs(schemaId: string): Promise<IpfsPinResult> {
  const { data, error } = await supabase.functions.invoke<IpfsPinResult>("pin-to-ipfs", {
    body: { schema_id: schemaId },
  });
  if (error) throw new Error(await extractEdgeFunctionError(error, "IPFS pinning failed"));
  if (!data) throw new Error("IPFS pinning returned no data");
  return data;
}

/**
 * Fetch JSON content for a CID or ipfs:// URI via the `fetch-from-ipfs`
 * edge function (server-side gateway resolution).
 */
export async function fetchFromIpfs(cidOrUri: string): Promise<IpfsFetchResult> {
  const { data, error } = await supabase.functions.invoke<IpfsFetchResult>("fetch-from-ipfs", {
    body: { uri: cidOrUri },
  });
  if (error) throw new Error(await extractEdgeFunctionError(error, "IPFS fetch failed"));
  if (!data) throw new Error("IPFS fetch returned no data");
  return data;
}

/** Direct HTTP gateway URL for a schema CID (no network call). */
export function getSchemaGatewayUrl(cidOrUri: string): string {
  return toGatewayUrl(cidOrUri);
}
