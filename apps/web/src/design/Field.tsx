import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../lib/cx';

const fieldClass = 'race-field m-1 w-[calc(100%-8px)] px-3 py-2.5 text-base placeholder:text-mist';

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  // The hint (e.g. a character counter) sits outside <label> so it isn't part of the field's name.
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold text-mist">
      <label htmlFor={htmlFor}>{children}</label>
      {hint && <span className="text-xs font-normal text-mist">{hint}</span>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm font-semibold text-flame">
      {children}
    </p>
  );
}

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <input
        id={inputId}
        className={fieldClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <textarea
        id={inputId}
        className={cx(fieldClass, 'resize-y')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <select
        id={inputId}
        className={cx(fieldClass, 'pr-8')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      >
        {children}
      </select>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
