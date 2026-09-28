// Replacement for 'next/link' in the artifact edition.
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { navigate } from './router';

export default function Link({ href, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; prefetch?: boolean }) {
  return (
    <a
      {...rest}
      href="#"
      onClick={(e) => {
        onClick?.(e);
        const cancelled = e.defaultPrevented;
        e.preventDefault();
        if (!cancelled) navigate(href);
      }}
    >
      {children}
    </a>
  );
}
