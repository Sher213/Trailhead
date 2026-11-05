// Thin client for the Anthropic Messages API, called directly from the browser.
//
// IMPORTANT: this ships your API key to the client. That's fine for local
// prototyping but not for anything you deploy publicly — see the README for
// how to swap this for a small server-side proxy before shipping.

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;

type ContentBlock = { type: string; text?: string };

export async function askClaude<T>(system: string, user: string): Promise<T> {
  if (!API_KEY) {
    throw new Error(
      "Missing VITE_ANTHROPIC_API_KEY. Add it to a .env file at the project root (see .env.example)."
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text: string = (data?.content as ContentBlock[] | undefined)
    ?.filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n") ?? "";

  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as T;
}
