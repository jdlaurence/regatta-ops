// The regatta's own fields, shared by "New regatta" and the settings dialog (PLAN.md §4.1).

import { Controller, type UseFormReturn } from 'react-hook-form';
import { Field, Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/controls';
import { Select } from '@/components/ui/select';
import { FORMAT_LABELS, timezoneOptions, type RegattaFormValues } from './regatta-form';

export function RegattaFields({
  form,
  idPrefix,
}: {
  form: UseFormReturn<RegattaFormValues>;
  idPrefix: string;
}) {
  const { register, formState, control, getValues, setValue } = form;
  const { errors } = formState;
  const id = (name: string) => `${idPrefix}-${name}`;
  const a11y = (name: keyof RegattaFormValues) => ({
    'aria-invalid': !!errors[name] || undefined,
    'aria-describedby': errors[name] ? `${id(name)}-error` : undefined,
  });
  const startField = register('startDate', {
    onChange: (e: { target: { value: string } }) => {
      const start = e.target.value;
      const end = getValues('endDate');
      if (start && (!end || end < start)) setValue('endDate', start, { shouldValidate: false });
    },
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id={id('name')} label="Name" error={errors.name?.message} className="sm:col-span-2">
        <Input id={id('name')} autoComplete="off" {...a11y('name')} {...register('name')} />
      </Field>
      <Field id={id('startDate')} label="Start date" error={errors.startDate?.message}>
        <Input id={id('startDate')} type="date" {...a11y('startDate')} {...startField} />
      </Field>
      <Field
        id={id('endDate')}
        label="End date"
        hint="Same as the start for a one-day regatta."
        error={errors.endDate?.message}
      >
        <Input id={id('endDate')} type="date" {...a11y('endDate')} {...register('endDate')} />
      </Field>
      <Field id={id('venue')} label="Venue" error={errors.venue?.message}>
        <Input id={id('venue')} autoComplete="off" {...register('venue')} />
      </Field>
      <Field id={id('city')} label="City" error={errors.city?.message}>
        <Input id={id('city')} autoComplete="off" {...register('city')} />
      </Field>
      <Field id={id('timezone')} label="Timezone" error={errors.timezone?.message}>
        <Controller
          control={control}
          name="timezone"
          render={({ field }) => (
            <Select
              id={id('timezone')}
              value={field.value}
              onValueChange={field.onChange}
              options={timezoneOptions(field.value)}
            />
          )}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="text-sm font-medium text-ink">
          Format
        </span>
        <Controller
          control={control}
          name="format"
          render={({ field }) => (
            <SegmentedControl
              label="Format"
              value={field.value}
              onValueChange={field.onChange}
              className="self-start"
              options={[
                { value: 'sprint', label: FORMAT_LABELS.sprint },
                { value: 'head', label: FORMAT_LABELS.head },
              ]}
            />
          )}
        />
      </div>
    </div>
  );
}
