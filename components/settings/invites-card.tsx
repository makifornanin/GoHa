"use client";

import { Check, Copy, UserPlus, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createInviteAction,
  deleteInviteAction,
  listInvitesAction,
  revokeInviteAction,
  setSignupModeAction,
  type InviteSummary,
  type PeopleOverview,
} from "@/app/(app)/settings/invite-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "", label: "Does not expire" },
];

const STATE_LABEL: Record<InviteSummary["state"], string> = {
  usable: "waiting",
  used: "accepted",
  expired: "expired",
  revoked: "withdrawn",
};

/** The form lives in the dialog so its keystrokes do not re-render the card. */
function NewInviteModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (invite: InviteSummary, link: string, code: string, qrSvg: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [expiry, setExpiry] = useState("7");
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createInviteAction({
        label,
        email,
        expiresInDays: expiry === "" ? null : Number(expiry),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLabel("");
      setEmail("");
      onCreated(result.data.invite, result.data.link, result.data.code, result.data.qrSvg);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite someone"
      description="They get their own GoHa: their own goals, habits and history. You will not see each other's."
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="space-y-1.5">
          <label htmlFor="invite-label" className="text-subhead text-label-secondary">
            Who is it for <span className="text-label-tertiary">(a note to yourself)</span>
          </label>
          <Input
            id="invite-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nanin"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="invite-email" className="text-subhead text-label-secondary">
            Lock to an email <span className="text-label-tertiary">(optional)</span>
          </label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@example.com"
          />
          <p className="text-footnote text-label-tertiary">
            Set this and only that address can use the link, so a forwarded invitation cannot be
            redeemed by someone else.
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="invite-expiry" className="text-subhead text-label-secondary">
            Expires
          </label>
          <Select id="invite-expiry" value={expiry} onChange={setExpiry} options={EXPIRY_OPTIONS} />
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={pending}>
            Create invitation
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Inviting other people into this GoHa.
 *
 * Each invitation is single use, optionally addressed, optionally expiring, and
 * withdrawable while it is still waiting. The link is shown once: only its hash
 * is stored, so there is genuinely no copy to return to.
 *
 * What the dialog says out loud, because it is the thing people assume wrongly:
 * an invited person gets their own separate GoHa. Nothing is shared. Every table
 * has been user-scoped since the first migration, so this is a statement about
 * how the data already works rather than a promise about how it will.
 */
export function InvitesCard({ className }: { className?: string }) {
  const [data, setData] = useState<PeopleOverview | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{
    link: string;
    code: string;
    qrSvg: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    startTransition(async () => {
      try {
        setData(await listInvitesAction());
      } catch (error) {
        console.error("listInvitesAction failed", error);
        toast.error("Could not load your invitations.");
        setData({ invites: [], signupMode: "invite_only", isOwner: false });
      }
    });
  }

  function created(
    invite: InviteSummary,
    link: string,
    code: string,
    qrSvg: string | null,
  ) {
    setData((current) => (current ? { ...current, invites: [invite, ...current.invites] } : current));
    setCreating(false);
    setCopied(false);
    setIssued({ link, code, qrSvg });
  }

  function act(
    id: string,
    run: (id: string) => Promise<{ ok: boolean; error?: string }>,
    after: (list: InviteSummary[]) => InviteSummary[],
    message: string,
  ) {
    startTransition(async () => {
      const result = await run(id);
      if (!result.ok) {
        toast.error(result.error ?? "That did not work.");
        return;
      }
      setData((current) => (current ? { ...current, invites: after(current.invites) } : current));
      toast.success(message);
    });
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
      toast.success("Invitation link copied.");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 lg:p-6",
        className,
      )}
    >
      <div className="mb-6 flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-label-secondary"
          aria-hidden
        >
          <UserPlus className="size-5" />
        </span>
        <div>
          <h2 className="text-headline text-label">People</h2>
          <p className="mt-0.5 text-callout text-label-secondary">
            Invite someone to their own GoHa on this install. Each account is separate.
          </p>
        </div>
      </div>

      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-callout text-label-secondary">
            Anyone with an invitation can create an account. Without one, sign-up is closed, which
            is what keeps a public address from becoming a public sign-up page.
          </p>
          <Button variant="secondary" onClick={load} loading={pending}>
            Show invitations
          </Button>
        </div>
      ) : data === null ? (
        <p className="py-4 text-center text-callout text-label-secondary">Loading...</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/*
            Who may sign up at all. Owner only, and enforced server-side: this
            is the one setting in GoHa that is about everyone rather than about
            the person changing it.
          */}
          <div className="rounded-xl bg-fill-quaternary px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body text-label">Who can create an account</p>
                <p className="mt-0.5 text-footnote text-label-tertiary">
                  {data.signupMode === "open"
                    ? "Anyone who reaches the sign-in page can sign up. Their data is entirely their own."
                    : "Only people you invite. A public address does not become a public sign-up page."}
                </p>
              </div>
              {data.isOwner ? (
                <Select
                  aria-label="Who can create an account"
                  className="w-44 shrink-0"
                  value={data.signupMode}
                  disabled={pending}
                  options={[
                    { value: "open", label: "Anyone" },
                    { value: "invite_only", label: "Invitation only" },
                  ]}
                  onChange={(next) => {
                    const mode = next === "open" ? "open" : "invite_only";
                    const previous = data.signupMode;
                    setData({ ...data, signupMode: mode });
                    startTransition(async () => {
                      const result = await setSignupModeAction(mode);
                      if (!result.ok) {
                        // Roll back rather than leave the screen claiming a
                        // policy that is not in force.
                        setData((current) =>
                          current ? { ...current, signupMode: previous } : current,
                        );
                        toast.error(result.error);
                        return;
                      }
                      toast.success(
                        mode === "open" ? "Anyone can sign up now." : "Sign-up is invitation only.",
                      );
                    });
                  }}
                />
              ) : (
                <span className="shrink-0 text-footnote text-label-tertiary">
                  {data.signupMode === "open" ? "Anyone" : "Invitation only"}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-callout text-label-secondary">
              {data.invites.filter((i) => i.state === "usable").length} waiting to be used
            </p>
            <Button onClick={() => setCreating(true)} disabled={pending}>
              Invite someone
            </Button>
          </div>

          {data.invites.length === 0 ? (
            <p className="rounded-xl bg-fill-quaternary px-4 py-6 text-center text-callout text-label-secondary">
              No invitations yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {data.invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-separator py-2 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-label">
                    {invite.label ?? invite.email ?? "Invitation"}
                    <span
                      className={cn(
                        "ml-2 text-footnote",
                        invite.state === "usable"
                          ? "text-blue"
                          : invite.state === "used"
                            ? "text-green"
                            : "text-label-tertiary",
                      )}
                    >
                      {STATE_LABEL[invite.state]}
                    </span>
                  </span>
                  {invite.email ? (
                    <span className="truncate text-footnote text-label-tertiary">{invite.email}</span>
                  ) : null}
                  <code className="font-mono text-footnote text-label-tertiary">
                    {invite.prefix}...
                  </code>
                  {invite.state === "usable" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        act(
                          invite.id,
                          revokeInviteAction,
                          (list) =>
                            list.map((i) => (i.id === invite.id ? { ...i, state: "revoked" } : i)),
                          "Invitation withdrawn.",
                        )
                      }
                    >
                      <XCircle className="size-3.5" aria-hidden />
                      Withdraw
                    </Button>
                  ) : invite.state !== "used" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`Delete invitation ${invite.prefix}`}
                      onClick={() =>
                        act(
                          invite.id,
                          deleteInviteAction,
                          (list) => list.filter((i) => i.id !== invite.id),
                          "Invitation deleted.",
                        )
                      }
                    >
                      Delete
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <NewInviteModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={created}
      />

      <Modal
        open={Boolean(issued)}
        onClose={() => setIssued(null)}
        title="Send this link"
        description="Shown once. GoHa stores only a hash of it, so there is no copy to come back for."
      >
        <div className="flex flex-col gap-4 px-6 py-5">
          {issued?.qrSvg ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="rounded-xl bg-white p-3 [&_svg]:block [&_svg]:size-44"
                // Our own SVG, generated on the server from our own link.
                dangerouslySetInnerHTML={{ __html: issued.qrSvg }}
                role="img"
                aria-label="QR code for the invitation link"
              />
              <p className="text-footnote text-label-tertiary">
                Or let them point a camera at this.
              </p>
            </div>
          ) : null}

          <code className="block overflow-auto rounded-xl bg-fill-quaternary px-3 py-2.5 font-mono text-footnote break-all text-label select-all">
            {issued?.link}
          </code>

          <p className="text-footnote text-label-tertiary">
            If the link cannot be clicked, the code is{" "}
            <span className="font-mono text-label-secondary">{issued?.code}</span>.
          </p>

          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={copyLink}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
