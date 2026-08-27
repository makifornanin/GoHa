"use client";

import {
  Archive,
  Clock,
  Download,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AutomationCard } from "@/components/settings/automation-card";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-card";
import type { AutomationOverview } from "@/app/(app)/settings/automation-actions";
import type { PeopleOverview } from "@/app/(app)/settings/invite-actions";
import type { PushOverview } from "@/app/(app)/settings/push-actions";
import { IphoneConnectionCard } from "@/components/settings/iphone-connection-card";
import { InvitesCard } from "@/components/settings/invites-card";
import {
  AutomationPrefsCard,
  type AutomationPrefs,
} from "@/components/settings/automation-prefs-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/use-mounted";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import {
  updatePreferencesAction,
  updateProfileAction,
  updateRhythmAction,
  updateThemeAction,
} from "@/app/(app)/settings/actions";
import {
  deleteArchivedAction,
  listArchivedAction,
  restoreArchivedAction,
  type ArchivedItem,
  type ArchivedKind,
} from "@/app/(app)/settings/archive-actions";
import { exportMyDataAction } from "@/app/(app)/settings/export-actions";
import { authClient } from "@/lib/auth-client";
import type { ThemeValue } from "@/lib/validations/settings";

type SettingsData = {
  theme: ThemeValue;
  timezone: string;
  weekStartsOn: number;
  dailyPlanningTime: string | null;
  eveningReflectionTime: string | null;
  automation: AutomationPrefs;
};


const THEME_OPTIONS: { value: ThemeValue; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const WEEK_START_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "0", label: "Sunday" },
  { value: "6", label: "Saturday" },
];

export function SettingsView({
  profile,
  settings,
  automationOverview,
  pushOverview,
  showAdvancedAutomation,
  people,
}: {
  profile: { name: string; email: string };
  settings: SettingsData;
  automationOverview: AutomationOverview | null;
  pushOverview: PushOverview;
  showAdvancedAutomation: boolean;
  people: PeopleOverview;
}) {
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Account">
        <ProfileCard className="lg:col-span-2" name={profile.name} email={profile.email} />
        <SecurityCard />
        <AppearanceCard dbTheme={settings.theme} />
      </SettingsSection>

      <SettingsSection
        title="Time and rhythm"
        description="How GoHa decides what today means, and when it expects you."
      >
        <PreferencesCard timezone={settings.timezone} weekStartsOn={settings.weekStartsOn} />
        <RhythmCard
          dailyPlanningTime={settings.dailyPlanningTime}
          eveningReflectionTime={settings.eveningReflectionTime}
        />
      </SettingsSection>

      <SettingsSection
        id="notifications"
        title="Notifications"
        description="GoHa never sends anything itself. These decide what it hands to the tool that does."
      >
        <AutomationPrefsCard prefs={settings.automation} />
        <IphoneConnectionCard initial={pushOverview} />
      </SettingsSection>

      {people.isOwner ? (
        <SettingsSection
          title="People"
          description="Who else can use this GoHa. Every account is separate."
        >
          <InvitesCard initial={people} className="lg:col-span-2" />
        </SettingsSection>
      ) : null}

      {showAdvancedAutomation && automationOverview ? (
        <SettingsSection
          title="Developer"
          description="Direct API access, for building automations against GoHa."
        >
          <AutomationCard initial={automationOverview} className="lg:col-span-2" />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Your data">
        <ArchiveCard />
        <DataCard />
      </SettingsSection>
    </div>
  );
}

/**
 * The daily rhythm: when you mean to plan, and when you mean to look back.
 *
 * These times are also the user's explicit scheduling preferences for the
 * central automation worker. Empty times remain disabled rather than inheriting
 * a surprise server default.
 */
function RhythmCard({
  dailyPlanningTime,
  eveningReflectionTime,
}: {
  dailyPlanningTime: string | null;
  eveningReflectionTime: string | null;
}) {
  // A `time` column comes back as "HH:MM:SS"; the input wants "HH:MM".
  const trim = (t: string | null) => (t ? t.slice(0, 5) : "");
  const [planning, setPlanning] = useState(trim(dailyPlanningTime));
  const [reflection, setReflection] = useState(trim(eveningReflectionTime));
  const [pending, startTransition] = useTransition();

  function persist(next: { dailyPlanningTime: string; eveningReflectionTime: string }) {
    startTransition(async () => {
      const res = await updateRhythmAction(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Rhythm saved.");
    });
  }

  return (
    <SettingsCard
      icon={<Clock className="size-5" />}
      title="Daily rhythm"
      description="When you intend to plan the day and look back at it."
    >
      {/*
        Two times side by side once there is room, stacked on a phone.

        Each was previously a full-width field: a five-character time stretched
        across the whole card, which read as a text box waiting for a sentence
        and left the label stranded above a lot of empty space. Capped at a
        width the value actually needs, and the pair shares a row on anything
        wider than a phone.
      */}
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="settings-planning" className="text-subhead text-label-secondary">
              Plan the day
            </label>
            <Input
              id="settings-planning"
              type="time"
              className="max-w-[11rem]"
              value={planning}
              disabled={pending}
              onChange={(e) => setPlanning(e.target.value)}
              onBlur={() =>
                persist({ dailyPlanningTime: planning, eveningReflectionTime: reflection })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="settings-reflection" className="text-subhead text-label-secondary">
              Look back
            </label>
            <Input
              id="settings-reflection"
              type="time"
              className="max-w-[11rem]"
              value={reflection}
              disabled={pending}
              onChange={(e) => setReflection(e.target.value)}
              onBlur={() =>
                persist({ dailyPlanningTime: planning, eveningReflectionTime: reflection })
              }
            />
          </div>
        </div>
        <p className="text-footnote leading-snug text-label-tertiary">
          When notifications are enabled, GoHa uses these times in your saved timezone for the
          morning brief and evening summary. Leave a time empty to keep that scheduled message
          off. These are separate from the dates on a task.
        </p>
      </div>
    </SettingsCard>
  );
}

/** Change the account password. Better Auth verifies the current one server-side. */
function SecurityCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, startTransition] = useTransition();

  function change() {
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        // Keep this device signed in; signing yourself out of the session you
        // are using to change the password is a hostile default.
        revokeOtherSessions: true,
      });
      if (error) {
        toast.error(error.message || "Could not change your password.");
        return;
      }
      setCurrent("");
      setNext("");
      toast.success("Password changed. Other devices were signed out.");
    });
  }

  return (
    <SettingsCard
      icon={<KeyRound className="size-5" />}
      title="Password"
      description="Change the password for this account."
    >
      <div className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <label htmlFor="settings-current-pw" className="text-subhead text-label-secondary">
            Current password
          </label>
          <Input
            id="settings-current-pw"
            type="password"
            autoComplete="current-password"
            value={current}
            disabled={pending}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="settings-new-pw" className="text-subhead text-label-secondary">
            New password
          </label>
          <Input
            id="settings-new-pw"
            type="password"
            autoComplete="new-password"
            value={next}
            disabled={pending}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={change}
            loading={pending}
            disabled={current.length === 0 || next.length === 0}
          >
            Change password
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}

/**
 * The way back out of the archive.
 *
 * Archiving is meant to be reversible, but only Task Maps ever offered a
 * restore: a mis-archived life area, goal or habit disappeared from every
 * screen permanently. Loaded on demand, so it costs nothing until opened.
 */
const ARCHIVE_LABEL: Record<ArchivedKind, string> = {
  "life-area": "Life area",
  goal: "Goal",
  habit: "Habit",
  "task-map": "Task map",
};

const DELETE_CONSEQUENCE: Record<ArchivedKind, string> = {
  "life-area":
    "Only the label goes. Goals, tasks and habits filed under it stay, with no life area.",
  goal: "Its sub-goals and its progress history go with it. Linked tasks stay.",
  habit:
    "Its whole entry history goes with it, which means the streak. This is the one deletion here that destroys a record of something you actually did.",
  "task-map": "Its nodes and connections go with it. Any tasks they linked to stay.",
};

function ArchiveCard({ className }: { className?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<ArchivedItem[] | null>(null);
  const [deleting, setDeleting] = useState<ArchivedItem | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    const item = deleting;
    if (!item) return;
    setDeleting(null);
    startTransition(async () => {
      const res = await deleteArchivedAction(item.kind, item.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
      toast.success(`Deleted "${item.name}"`);
      router.refresh();
    });
  }

  function load() {
    startTransition(async () => {
      try {
        setItems(await listArchivedAction());
      } catch (error) {
        console.error("listArchivedAction failed", error);
        toast.error("Could not load your archive.");
        setItems([]);
      }
    });
  }

  function restore(item: ArchivedItem) {
    startTransition(async () => {
      const res = await restoreArchivedAction(item.kind, item.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
      toast.success(`Restored "${item.name}"`);
      router.refresh();
    });
  }

  return (
    <SettingsCard
      icon={<Archive className="size-5" />}
      title="Archive"
      description="Anything you archived, and the way to bring it back."
      className={className}
    >
      {items === null ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-callout text-label-secondary">
            Archiving hides something without deleting it. Restoring brings it back exactly as it
            was, with its history intact.
          </p>
          <Button variant="secondary" onClick={load} loading={pending}>
            Show archive
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-fill-quaternary px-4 py-6 text-center text-callout text-label-secondary">
          Nothing is archived.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-separator py-2 last:border-0"
            >
              <span className="w-16 shrink-0 text-caption uppercase tracking-wide text-label-tertiary">
                {ARCHIVE_LABEL[item.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-label">{item.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => restore(item)} disabled={pending}>
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red hover:bg-red/10"
                  onClick={() => setDeleting(item)}
                  disabled={pending}
                  aria-label={`Delete ${item.name} permanently`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete permanently?"
        description={deleting ? `"${deleting.name}" cannot be brought back.` : undefined}
      >
        <div className="flex flex-col gap-4 px-6 py-5">
          {/* What each deletion actually takes with it. Saying "this cannot be
              undone" is true of everything and tells nobody anything. */}
          <p className="text-callout text-label-secondary">
            {deleting ? DELETE_CONSEQUENCE[deleting.kind] : null}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete} loading={pending}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsCard>
  );
}

/**
 * A readable copy of your main records. NOT the backup.
 *
 * This used to describe itself as "everything you have created", which was not
 * true and was the more dangerous half of audit finding R-04: it reads like a
 * backup, so it discourages having one. What it actually omits is task map
 * nodes and edges, daily priorities, goal progress history, the focus session
 * currently running, inactive habit schedules, and anything outside its caps
 * and date ranges. There is also no path that puts any of it back.
 *
 * The real backup is `pnpm db:backup` (scripts/backup.mts): all 19 tables, no
 * caps, validated by `pnpm db:restore-check`. The copy is still worth having,
 * so the wording now says what it is instead of overselling it.
 */
function DataCard({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();

  function exportData() {
    startTransition(async () => {
      try {
        const { filename, json } = await exportMyDataAction();
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Export downloaded");
      } catch (error) {
        console.error("exportMyDataAction failed", error);
        toast.error("Could not build your export. Please try again.");
      }
    });
  }

  return (
    <SettingsCard
      icon={<Download className="size-4" />}
      title="Export and delete"
      description="A readable copy of your main records, as one JSON file."
      className={className}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-callout text-label-secondary">
          Life areas, goals, tasks, habits and their history, focus sessions, brain dump, task maps,
          and weekly reviews. Sign-in details are never included.{" "}
          <span className="text-label-tertiary">
            This is a convenience copy to read or move elsewhere, not a backup: it leaves out map
            nodes, daily priorities and goal history, and nothing here restores it. The full backup
            is the <code className="font-mono">db:backup</code> script.
          </span>
        </p>
        <Button onClick={exportData} loading={pending}>
          <Download className="size-4" aria-hidden />
          Export
        </Button>
      </div>
    </SettingsCard>
  );
}

function ProfileCard({
  name: initialName,
  email,
  className,
}: {
  name: string;
  email: string;
  className?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== saved.trim() && name.trim().length > 0;

  function save() {
    startTransition(async () => {
      const res = await updateProfileAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(name.trim());
      setName(name.trim());
      toast.success("Profile updated.");
      router.refresh();
    });
  }

  return (
    <SettingsCard
      className={className}
      icon={<User className="size-5" />}
      title="Profile"
      description="Your display name and account email."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save();
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="settings-name" className="text-subhead text-label-secondary">
            Display name
          </label>
          <Input
            id="settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="settings-email" className="text-subhead text-label-secondary">
            Email address
          </label>
          <Input id="settings-email" value={email} readOnly disabled aria-describedby="settings-email-hint" />
          <p id="settings-email-hint" className="text-footnote text-label-tertiary">
            Your sign-in email cannot be changed here.
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty} loading={pending}>
            Save changes
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

function AppearanceCard({ dbTheme }: { dbTheme: ThemeValue }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [pending, startTransition] = useTransition();
  // Before hydration, reflect the persisted value to avoid a mismatch/flicker.
  const active = ((mounted ? theme : dbTheme) ?? dbTheme) as ThemeValue;

  function choose(value: ThemeValue) {
    if (value === active) return;
    const previous = (theme as ThemeValue) ?? dbTheme;
    setTheme(value); // apply instantly (no flash: next-themes swaps the class)
    startTransition(async () => {
      const res = await updateThemeAction(value);
      if (!res.ok) {
        setTheme(previous); // roll back the applied theme on a failed save
        toast.error(res.error);
      }
    });
  }

  return (
    <SettingsCard
      icon={<Palette className="size-5" />}
      title="Appearance"
      description="Choose a theme. System follows your device."
    >
      <fieldset disabled={pending}>
        <legend className="sr-only">Theme</legend>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = active === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors",
                  "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-blue/40",
                  isActive
                    ? "border-blue bg-blue/12 text-blue"
                    : "border-separator-opaque text-label-secondary hover:border-gray-2 hover:text-label",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={isActive}
                  onChange={() => choose(opt.value)}
                  className="sr-only"
                />
                <Icon className="size-6" aria-hidden />
                <span className="text-callout font-medium">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </SettingsCard>
  );
}

function PreferencesCard({
  timezone: initialTz,
  weekStartsOn: initialWeek,
}: {
  timezone: string;
  weekStartsOn: number;
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initialTz);
  const [weekStartsOn, setWeekStartsOn] = useState(String(initialWeek));
  const [pending, startTransition] = useTransition();

  // If the saved timezone is outside the curated list, keep it selectable.
  const tzOptions = TIMEZONE_OPTIONS.some((o) => o.value === initialTz)
    ? TIMEZONE_OPTIONS
    : [{ value: initialTz, label: initialTz }, ...TIMEZONE_OPTIONS];

  function persist(next: { timezone: string; weekStartsOn: string }) {
    startTransition(async () => {
      const res = await updatePreferencesAction({
        timezone: next.timezone,
        weekStartsOn: Number(next.weekStartsOn),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Preferences saved.");
      router.refresh(); // re-derive Today / This Week across the app
    });
  }

  return (
    <SettingsCard
      icon={<SlidersHorizontal className="size-5" />}
      title="Preferences"
      description="How dates and weeks are calculated across GoHa."
    >
      <div className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <label htmlFor="settings-timezone" className="text-subhead text-label-secondary">
            Timezone
          </label>
          <Select
            id="settings-timezone"
            value={timezone}
            disabled={pending}
            onChange={(v) => {
              setTimezone(v);
              persist({ timezone: v, weekStartsOn });
            }}
            options={tzOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="settings-week-start" className="text-subhead text-label-secondary">
            Week starts on
          </label>
          <Select
            id="settings-week-start"
            value={weekStartsOn}
            disabled={pending}
            onChange={(v) => {
              setWeekStartsOn(v);
              persist({ timezone, weekStartsOn: v });
            }}
            options={WEEK_START_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
