"use client";

import { Monitor, Moon, Palette, SlidersHorizontal, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import {
  updatePreferencesAction,
  updateProfileAction,
  updateThemeAction,
} from "@/app/(app)/settings/actions";
import type { ThemeValue } from "@/lib/validations/settings";

type SettingsData = {
  theme: ThemeValue;
  timezone: string;
  weekStartsOn: number;
};

const noopSubscribe = () => () => {};
/** SSR-safe "are we hydrated" flag without setState-in-effect. */
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

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
}: {
  profile: { name: string; email: string };
  settings: SettingsData;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <ProfileCard className="lg:col-span-2" name={profile.name} email={profile.email} />
      <AppearanceCard dbTheme={settings.theme} />
      <PreferencesCard timezone={settings.timezone} weekStartsOn={settings.weekStartsOn} />
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
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
          {icon}
        </span>
        <div>
          <h2 className="text-headline text-label">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-callout text-label-secondary">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
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
            onChange={(e) => {
              setTimezone(e.target.value);
              persist({ timezone: e.target.value, weekStartsOn });
            }}
          >
            {tzOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="settings-week-start" className="text-subhead text-label-secondary">
            Week starts on
          </label>
          <Select
            id="settings-week-start"
            value={weekStartsOn}
            disabled={pending}
            onChange={(e) => {
              setWeekStartsOn(e.target.value);
              persist({ timezone, weekStartsOn: e.target.value });
            }}
          >
            {WEEK_START_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </SettingsCard>
  );
}
