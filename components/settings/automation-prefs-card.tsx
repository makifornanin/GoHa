"use client";

import { BellRing } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateAutomationPrefsAction } from "@/app/(app)/settings/actions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingsCard } from "@/components/settings/settings-card";

export type AutomationPrefs = {
  morningBriefEnabled: boolean;
  eveningSummaryEnabled: boolean;
  deadlineAlertsEnabled: boolean;
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
  className,
}: {
  prefs: AutomationPrefs;
  className?: string;
}) {
  const [value, setValue] = useState(prefs);
  const [pending, startTransition] = useTransition();

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
