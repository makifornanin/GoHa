"use client";

import { Check, Copy, Plug, Trash2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createAutomationTokenAction,
  deleteAutomationTokenAction,
  revokeAutomationTokenAction,
  type AutomationOverview,
  type TokenSummary,
} from "@/app/(app)/settings/automation-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { SettingsCard } from "@/components/settings/settings-card";
import { cn } from "@/lib/utils";

/**
 * The automation surface, from the owner's side.
 *
 * Three things this has to be honest about, because a credential the owner
 * cannot see is easy to misunderstand:
 *
 *  - The secret is shown once. Not "for security reasons" in the abstract:
 *    only its hash is stored, so there is genuinely no copy to show later.
 *  - A token can read the owner's whole day. The scope selector says what each
 *    one allows in plain words rather than in permission names.
 *  - What has actually been calling. The request log is the answer to "is my
 *    automation working", which is otherwise only knowable from the other side.
 */

const SCOPE_OPTIONS = [
  { value: "read", label: "Read only" },
  { value: "read_write", label: "Read, and write (log, quotes, capture)" },
];

const EXPIRY_OPTIONS = [
  { value: "", label: "Does not expire" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

const ENDPOINTS = [
  { method: "GET", path: "/api/automation", what: "Check a token and list what it can reach." },
  { method: "GET", path: "/api/automation/quote/today", what: "Today's quote, and the day's context." },
  { method: "POST", path: "/api/automation/quotes", what: "Push quotes or verses in; pin one to a date." },
  { method: "GET", path: "/api/automation/brief/morning", what: "The morning brief: the same judgement Today shows." },
  { method: "GET", path: "/api/automation/brief/evening", what: "How the day actually went." },
  { method: "GET", path: "/api/automation/due", what: "Deadlines, overdue work, runaway focus, streaks at risk." },
  { method: "GET", path: "/api/automation/graveyard", what: "Work that has stopped moving." },
  { method: "GET", path: "/api/automation/review/week-stats", what: "The week's numbers, as Review derives them." },
  { method: "POST", path: "/api/automation/review/draft", what: "Draft into EMPTY review fields only." },
  { method: "POST", path: "/api/automation/log", what: "Claim a key once, so a repeat run sends nothing." },
  { method: "POST", path: "/api/automation/brain-dump", what: "Capture a thought from Siri or a Shortcut." },
];

/** Plain names for the notification kinds the log stores. */
const KIND_LABEL: Record<string, string> = {
  morning_brief: "Morning brief",
  evening_summary: "Evening summary",
  deadline: "Deadline alert",
  focus_overrun: "Focus overrun",
  streak_risk: "Streak at risk",
  graveyard: "Graveyard sweep",
  review_draft: "Review draft",
  health: "Health alert",
  sabbath: "Sabbath reminder",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * The create form, in its own component so its keystrokes stay local.
 *
 * Holding this state in the card meant every character re-rendered the whole
 * card, and therefore the dialog, and therefore anything the dialog does on
 * render. That is how a click on a Select option ended up dismissing the
 * dialog, before `Modal` stopped re-running its focus setup on every render.
 * The rest of this codebase keeps modal form state in the modal for the same
 * reason.
 */
function NewTokenModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (token: TokenSummary, secret: string, qrSvg: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState("read");
  const [expiry, setExpiry] = useState("");
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createAutomationTokenAction({
        name,
        scope: scope === "read_write" ? "read_write" : "read",
        expiresInDays: expiry === "" ? null : Number(expiry),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setName("");
      onCreated(result.data.token, result.data.secret, result.data.qrSvg);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New automation token"
      description="Name it after the thing that will use it, so you know what you are revoking later."
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="space-y-1.5">
          <label htmlFor="automation-token-name" className="text-subhead text-label-secondary">
            Name
          </label>
          <Input
            id="automation-token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="n8n morning brief"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="automation-token-scope" className="text-subhead text-label-secondary">
            What it may do
          </label>
          <Select
            id="automation-token-scope"
            value={scope}
            onChange={setScope}
            options={SCOPE_OPTIONS}
          />
          <p className="text-footnote text-label-tertiary">
            Either way it can read your tasks, goals and habits. Neither can create, complete or
            reschedule anything.
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="automation-token-expiry" className="text-subhead text-label-secondary">
            Expires
          </label>
          <Select
            id="automation-token-expiry"
            value={expiry}
            onChange={setExpiry}
            options={EXPIRY_OPTIONS}
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={pending} disabled={name.trim() === ""}>
            Create token
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function AutomationCard({
  initial,
  className,
}: {
  /** Loaded with the page, so the tokens are simply there. */
  initial: AutomationOverview;
  className?: string;
}) {
  const [data, setData] = useState<AutomationOverview>(initial);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ value: string; name: string; qrSvg: string | null } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function created(token: TokenSummary, value: string, qrSvg: string | null) {
    setData((current) => (current ? { ...current, tokens: [token, ...current.tokens] } : current));
    setCreating(false);
    setCopied(false);
    // The one and only time this value exists outside the caller's clipboard.
    setSecret({ value, name: token.name, qrSvg });
  }

  function revoke(token: TokenSummary) {
    startTransition(async () => {
      const result = await revokeAutomationTokenAction(token.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setData((current) =>
        current
          ? {
              ...current,
              tokens: current.tokens.map((t) =>
                t.id === token.id
                  ? { ...t, active: false, revokedAt: new Date().toISOString() }
                  : t,
              ),
            }
          : current,
      );
      toast.success(`"${token.name}" can no longer be used.`);
    });
  }

  function remove(token: TokenSummary) {
    startTransition(async () => {
      const result = await deleteAutomationTokenAction(token.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setData((current) =>
        current ? { ...current, tokens: current.tokens.filter((t) => t.id !== token.id) } : current,
      );
      toast.success(`Deleted "${token.name}"`);
    });
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      toast.success("Token copied.");
    } catch {
      // Clipboard access can be refused. Say so rather than showing a tick for
      // something that did not happen; the value is on screen to select by hand.
      toast.error("Could not copy. Select the token and copy it manually.");
    }
  }

  return (
    <SettingsCard
      className={className}
      icon={<Plug className="size-5" />}
      title="Automations"
      description="Let something outside GoHa read your day: a morning brief on your phone, a streak rescue in the evening."
    >
      <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-callout text-label-secondary">
              {data.tokens.filter((t) => t.active).length} active{" "}
              {data.tokens.filter((t) => t.active).length === 1 ? "token" : "tokens"}
            </p>
            <Button onClick={() => setCreating(true)} disabled={pending}>
              New token
            </Button>
          </div>

          {data.tokens.length === 0 ? (
            <p className="rounded-xl bg-fill-quaternary px-4 py-6 text-center text-callout text-label-secondary">
              No tokens yet. Create one and give it to your automation tool.
            </p>
          ) : (
            <ul className="flex flex-col">
              {data.tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-separator py-2 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-label">
                    {token.name}
                    {!token.active ? (
                      <span className="ml-2 text-footnote text-label-tertiary">
                        {token.revokedAt ? "revoked" : "expired"}
                      </span>
                    ) : null}
                  </span>
                  <code className="font-mono text-footnote text-label-tertiary">
                    {token.prefix}...
                  </code>
                  <span className="text-footnote text-label-tertiary">
                    {token.scope === "read_write" ? "read + write" : "read"}
                  </span>
                  <span className="w-24 text-right text-footnote text-label-tertiary">
                    used {timeAgo(token.lastUsedAt)}
                  </span>
                  {token.active ? (
                    <Button variant="ghost" size="sm" onClick={() => revoke(token)} disabled={pending}>
                      <XCircle className="size-3.5" aria-hidden />
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(token)}
                      disabled={pending}
                      aria-label={`Delete ${token.name}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {data.baseUrl ? (
            <div className="rounded-xl bg-fill-quaternary px-3 py-2.5">
              <p className="text-footnote text-label-secondary">
                Point your automations at
              </p>
              <code className="mt-0.5 block font-mono text-footnote break-all text-label select-all">
                {data.baseUrl}
              </code>
              {data.baseUrl.includes("localhost") ? (
                <p className="mt-1 text-footnote text-orange">
                  This is a local address. Your phone and n8n cannot reach it; deploy first, then
                  create the token you will actually use.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <h3 className="text-subhead text-label">What a token can reach</h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {ENDPOINTS.map((endpoint) => (
                <li key={endpoint.path} className="flex flex-wrap items-baseline gap-x-2">
                  <code className="font-mono text-footnote text-label-secondary">
                    {endpoint.method} {endpoint.path}
                  </code>
                  <span className="text-footnote text-label-tertiary">{endpoint.what}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-footnote text-label-tertiary">
              Send the token as{" "}
              <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. Never in a
              query string: those end up in logs.
            </p>
          </div>

          {data.requests.length > 0 ? (
            <div>
              <h3 className="text-subhead text-label">Recent calls</h3>
              <ul className="mt-2 flex flex-col">
                {data.requests.slice(0, 8).map((request) => (
                  <li
                    key={request.id}
                    className="flex items-center gap-3 border-b border-separator py-1.5 text-footnote last:border-0"
                  >
                    <span
                      className={cn(
                        "w-10 shrink-0 font-mono tabular-nums",
                        request.status >= 400 ? "text-red" : "text-green",
                      )}
                    >
                      {request.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-label-secondary">
                      {request.route}
                    </span>
                    <span className="shrink-0 text-label-tertiary">{timeAgo(request.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.sent.length > 0 ? (
            <div>
              <h3 className="text-subhead text-label">Sent by your automations</h3>
              <ul className="mt-2 flex flex-col">
                {data.sent.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 border-b border-separator py-1.5 text-footnote last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-label-secondary">
                      {KIND_LABEL[entry.kind] ?? entry.kind}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-label-tertiary">
                      {entry.date}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
      </div>

      <NewTokenModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={created}
      />

      <Modal
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="Copy this token now"
        description="This is the only time it can be shown. GoHa stores a hash of it, so there is no copy to come back for."
      >
        <div className="flex flex-col gap-4 px-6 py-5">
          {secret?.qrSvg ? (
            <div className="flex flex-col items-center gap-2">
              {/*
                Server-rendered SVG from the `qrcode` library, so no encoder
                reaches the browser bundle. On a white plate in both themes,
                because a scanner needs the contrast the spec assumes and a
                dark-mode QR code is a QR code that does not scan.
              */}
              <div
                className="rounded-xl bg-white p-3 [&_svg]:block [&_svg]:size-44"
                // Our own SVG, from our own encoder call on the server, never
                // user input.
                dangerouslySetInnerHTML={{ __html: secret.qrSvg }}
                role="img"
                aria-label="QR code containing this GoHa address and token"
              />
              <p className="text-footnote text-label-tertiary">
                Point your phone&apos;s camera at this to carry the address and token across.
              </p>
            </div>
          ) : null}

          <code className="block max-h-32 overflow-auto rounded-xl bg-fill-quaternary px-3 py-2.5 font-mono text-footnote break-all text-label select-all">
            {secret?.value}
          </code>
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={copySecret}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => setSecret(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </SettingsCard>
  );
}
