import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function Section({ title, description, children }: SectionProps) {
  return (
    <section className="space-y-3 rounded-xl border border-rh-border p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-rh-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
