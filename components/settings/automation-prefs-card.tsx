"use client";

import { BellRing, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateAutomationPrefsAction } from "@/app/(app)/settings/actions";
import { smartReminderWindow } from "@/lib/automation/smart-reminder";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingsCard } from "@/components/settings/settings-card";

export type AutomationPrefs = {
  morningBriefEnabled: boolean;
  eveningSummaryEnabled: boolean;
  deadlineAlertsEnabled: boolean;
  smartRemindersEnabled: boolean;
  deadlineLeadMinutes: number;
  quoteSourcePref: "quote" | "verse" | "both";
  sabbathDay: number | null;
};

const SABBATH_OPTIONS = [
  { value: "", label: "No rest day" },
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const QUOTE_OPTIONS = [
  { value: "both", label: "Quotes and verses" },
  { value: "verse", label: "Verses only" },
  { value: "quote", label: "Quotes only" },
];

/**
 * One switch row: what it does, why, and the control.
 *
 * The label is a real `<label for>` so the text is part of the hit target, and
 * the hint sits under it rather than beside the switch, which keeps the switches
 * in one vertical line however long the wording gets.
 */
function ToggleRow({
  id,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-body text-label">
          {label}
        </label>
        <p className="mt-1 text-footnote leading-snug text-label-tertiary">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

/**
 * What the automation layer is allowed to say, and when it stays quiet.
 *
 * Every switch here is enforced by the API, not merely recorded: with the
 * morning brief off, its endpoint returns a silent response, so a workflow
 * someone forgot to disable still sends nothing. A control that depends on the
 * workflow checking it would be decoration.
 *
 * All three default to OFF. A notification nobody asked for is worse than no
 * automation at all.
 */
export function AutomationPrefsCard({
  prefs,
  morningTime,
  eveningTime,
  className,
}: {
  prefs: AutomationPrefs;
  /** Daily Rhythm times, so this card can say when a toggle cannot fire. */
  morningTime: string | null;
  eveningTime: string | null;
  className?: string;
}) {
  const [value, setValue] = useState(prefs);
  const [pending, startTransition] = useTransition();

  // The worker's own rule, not a copy of it: the same function decides whether
  // any slot exists, so this warning cannot drift from the actual behaviour.
  const hasReminderWindow = smartReminderWindow({ morningTime, eveningTime }) !== null;

  function persist(next: AutomationPrefs) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await updateAutomationPrefsAction({
        ...next,
        // The Select speaks strings; the schema coerces, but sending the real
        // shape keeps the action's contract honest.
        sabbathDay: next.sabbathDay,
      });
      if (!result.ok) {
        // Roll back rather than leave the screen claiming a saved setting that
        // is not saved. A silent failure here is a notification that arrives
        // on a rest day.
        setValue(previous);
        toast.error(result.error);
        return;
      }
      toast.success("Automation preferences saved.");
    });
  }

  return (
    <SettingsCard
      className={className}
      icon={<BellRing className="size-5" />}
      title="What automations may send"
      description="Choose which GoHa smart notifications are allowed on your connected devices."
    >
      <div className="flex flex-col gap-5">
        <ToggleRow
          id="pref-morning"
          label="Morning brief"
          hint="The day's ranking, overdue work, habits and your quote."
          checked={value.morningBriefEnabled}
          disabled={pending}
          onChange={(next) => persist({ ...value, morningBriefEnabled: next })}
        />
        <ToggleRow
          id="pref-evening"
          label="Evening summary"
          hint="What you finished, what slipped, habits against their targets."
          checked={value.eveningSummaryEnabled}
          disabled={pending}
          onChange={(next) => persist({ ...value, eveningSummaryEnabled: next })}
        />
        <ToggleRow
          id="pref-deadline"
          label="Deadline and focus alerts"
          hint="Due soon, overdue today, or a focus timer left running."
          checked={value.deadlineAlertsEnabled}
          disabled={pending}
          onChange={(next) => persist({ ...value, deadlineAlertsEnabled: next })}
        />

        {value.deadlineAlertsEnabled ? (
          <div className="space-y-1.5">
            <label htmlFor="pref-lead" className="text-subhead text-label-secondary">
              Look ahead by
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="pref-lead"
                type="number"
                min={5}
                max={1440}
                className="w-28"
                value={String(value.deadlineLeadMinutes)}
                disabled={pending}
                onChange={(e) =>
                  setValue({ ...value, deadlineLeadMinutes: Number(e.target.value) })
                }
                onBlur={() => persist(value)}
              />
              <span className="text-callout text-label-secondary">minutes</span>
            </div>
          </div>
        ) : null}

        <ToggleRow
          id="pref-smart"
          label="Smart task reminders"
          hint="Up to four nudges a day about work still open, spread between your morning and evening times."
          checked={value.smartRemindersEnabled}
          disabled={pending}
          onChange={(next) => persist({ ...value, smartRemindersEnabled: next })}
        />

        {/*
          A switch that says "on" and can never fire is worse than one that is
          off, because the user believes it is working.

          Smart reminders live BETWEEN the two Daily Rhythm times: two hours
          after the morning brief, two hours before the evening summary. Without
          both times there is no window and no slot is ever queued; with times
          too close together (08:00 and 09:00, say) the window is empty for the
          same reason. The feature was silently inert in both cases and nothing
          on this screen said so. It is the SAME function the worker uses, so
          this cannot drift from what actually happens.
        */}
        {value.smartRemindersEnabled && !hasReminderWindow ? (
          <p
            role="status"
            className="flex gap-2 rounded-xl border border-orange/30 bg-orange/10 px-3 py-2.5 text-callout text-label"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden />
            <span>
              These cannot be sent yet.{" "}
              {morningTime && eveningTime
                ? "Your morning and evening times are too close together to leave room between them."
                : "Set both a morning and an evening time under Daily Rhythm first."}
            </span>
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="pref-quote" className="text-subhead text-label-secondary">
            Daily card shows
          </label>
          <Select
            id="pref-quote"
            value={value.quoteSourcePref}
            disabled={pending}
            options={QUOTE_OPTIONS}
            onChange={(next) =>
              persist({ ...value, quoteSourcePref: next as AutomationPrefs["quoteSourcePref"] })
            }
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pref-sabbath" className="text-subhead text-label-secondary">
            Sabbath day
          </label>
          <Select
            id="pref-sabbath"
            value={value.sabbathDay === null ? "" : String(value.sabbathDay)}
            disabled={pending}
            options={SABBATH_OPTIONS}
            onChange={(next) =>
              persist({ ...value, sabbathDay: next === "" ? null : Number(next) })
            }
          />
          <p className="text-footnote text-label-tertiary">
            On this day GoHa sends no task notifications and shows a rest view. One morning
            reminder only. Your streaks and history carry on exactly as normal: the rest is from
            being told things, not from the record.
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
