"use client";

import { useRef, useState } from "react";

import type { ActionResult } from "@/app/(app)/life-areas/actions";
import type { LifeArea } from "@/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_NAME_MAX,
  LIFE_AREA_WEIGHT_MAX,
  nextUnusedColorKey,
  toColorKey,
  toIconKey,
  type LifeAreaIconKey,
} from "@/lib/life-areas";
import {
  lifeAreaFormSchema,
  toFieldErrors,
  type LifeAreaFieldErrors,
  type LifeAreaFormInput,
} from "@/lib/validations/life-area";
import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { cn } from "@/lib/utils";


function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-body-sm text-error">
      {message}
    </p>
  );
}

type FormProps = {
  mode: "create" | "edit";
  area?: LifeArea | null;
  /** Colours already taken, so a new area is preselected a distinct one. */
  usedColors?: readonly (string | null | undefined)[];
  onSubmit: (values: LifeAreaFormInput) => Promise<ActionResult<LifeArea>>;
  onClose: () => void;
  nameRef: React.RefObject<HTMLInputElement | null>;
};

/**
 * The form fields. Rendered only while the modal is open, so its state
 * initializes fresh from `area` on every open (no reset effect needed).
 */
function LifeAreaFormFields({ mode, area, usedColors, onSubmit, onClose, nameRef }: FormProps) {
  const [name, setName] = useState(() => area?.name ?? "");
  const [description, setDescription] = useState(() => area?.description ?? "");
  const [color, setColor] = useState<string>(() =>
    area ? toColorKey(area.color) : nextUnusedColorKey(usedColors ?? []),
  );
  const [icon, setIcon] = useState<LifeAreaIconKey>(() => toIconKey(area?.icon));
  const [weight, setWeight] = useState(() => area?.weight ?? 1);
  const [fieldErrors, setFieldErrors] = useState<LifeAreaFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const values: LifeAreaFormInput = { name, description, color, icon, weight };
    const parsed = lifeAreaFormSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const result = await onSubmit(values);
    if (!result.ok) {
      setSubmitting(false);
      setFieldErrors(result.fieldErrors ?? {});
      setFormError(result.error);
    }
    // On success the parent closes the modal, unmounting this form.
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5" noValidate>
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error"
        >
          {formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="la-name" className="mb-1.5 block text-label-md text-on-surface-variant">
          Name
        </label>
        <Input
          id="la-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIFE_AREA_NAME_MAX}
          placeholder="e.g. Health, Career, Finance"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "la-name-error" : undefined}
          disabled={submitting}
        />
        <FieldError id="la-name-error" message={fieldErrors.name} />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="la-description" className="block text-label-md text-on-surface-variant">
            Description <span className="text-outline">(optional)</span>
          </label>
          <span className="text-label-sm text-outline">
            {description.length}/{LIFE_AREA_DESCRIPTION_MAX}
          </span>
        </div>
        <Textarea
          id="la-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={LIFE_AREA_DESCRIPTION_MAX}
          placeholder="What does this area of your life cover?"
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={fieldErrors.description ? "la-description-error" : undefined}
          disabled={submitting}
        />
        <FieldError id="la-description-error" message={fieldErrors.description} />
      </div>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">Colour</legend>
        <ColorPicker
          value={color}
          onChange={setColor}
          entityId={area?.id ?? "new"}
          disabled={submitting}
        />
      </fieldset>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">Icon</legend>
        <IconPicker value={icon} onChange={setIcon} disabled={submitting} />
      </fieldset>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">
          Importance <span className="text-outline">(weights your life balance)</span>
        </legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Importance">
          {Array.from({ length: LIFE_AREA_WEIGHT_MAX }, (_, i) => i + 1).map((value) => {
            const selected = weight === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${value}`}
                onClick={() => setWeight(value)}
                className={cn(
                  "h-9 flex-1 rounded-lg border text-label-md transition-colors",
                  selected
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant text-on-surface-variant hover:border-primary",
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
        <FieldError id="la-weight-error" message={fieldErrors.weight} />
      </fieldset>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === "create" ? "Create life area" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Create/edit form for a life area, shown in a Modal. The inner form is mounted
 * only while open, so it always starts from the current `area` without a reset
 * effect. Validates with the shared Zod schema and surfaces field- and
 * form-level errors; the parent owns persistence and closes on success.
 */
export function LifeAreaFormModal({
  open,
  mode,
  area,
  usedColors,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  area?: LifeArea | null;
  usedColors?: readonly (string | null | undefined)[];
  onSubmit: (values: LifeAreaFormInput) => Promise<ActionResult<LifeArea>>;
  onClose: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New life area" : "Edit life area"}
      description={
        mode === "create"
          ? "Name a domain of your life to organize goals and habits around."
          : undefined
      }
      initialFocus={() => nameRef.current}
    >
      <LifeAreaFormFields
        mode={mode}
        area={area}
        usedColors={usedColors}
        onSubmit={onSubmit}
        onClose={onClose}
        nameRef={nameRef}
      />
    </Modal>
  );
}
