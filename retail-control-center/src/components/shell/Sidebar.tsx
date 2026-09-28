'use client';

import { CalendarDays, FileText, GanttChart, History, Layers, LayoutDashboard, ListChecks, PanelLeftClose, PanelLeftOpen, Settings, SquareKanban, Store } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/client/store';
import { cn } from '@/components/ui/primitives';

export const NAV = [
  { href: '/', label: 'Program Overview', icon: LayoutDashboard },
  { href: '/stores', label: 'Store SAL', icon: Store },
  { href: '/areas', label: 'Functional Areas', icon: Layers },
  { href: '/actions', label: 'Action Log', icon: ListChecks },
  { href: '/kanban', label: 'Kanban', icon: SquareKanban },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/timeline', label: 'Program Timeline', icon: GanttChart },
  { href: '/minutes', label: 'Meeting Minutes', icon: FileText },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const toggle = useApp((s) => s.toggleSidebar);
  const issues = useApp((s) => s.snapshot?.issues.filter((i) => i.severity === 'error').length ?? 0);
  return (
    <nav className={cn('no-print flex shrink-0 flex-col border-r border-line bg-[#F6F3EE] transition-[width] duration-150', collapsed ? 'w-14' : 'w-[var(--sidebar-w)]')} aria-label="Main navigation">
      <div className={cn('flex h-14 items-center border-b border-line', collapsed ? 'justify-center' : 'px-4')}>
        {collapsed ? (
          <span className="font-display text-xl font-semibold text-ink" title="Golden Goose">GG</span>
        ) : (
          <div className="leading-tight">
            <div className="text-[13px] font-bold uppercase tracking-[0.28em] text-ink">Golden Goose</div>
            <div className="mt-0.5 text-2xs uppercase tracking-[0.12em] text-sand-700">Retail Opening Control Center</div>
          </div>
        )}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'group relative flex h-9 items-center gap-3 rounded-md text-[13px] font-medium transition-colors',
                  collapsed ? 'justify-center' : 'px-3',
                  active ? 'bg-paper text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:bg-paper/70 hover:text-ink',
                )}
              >
                {active && <span className="absolute left-0 top-2 h-5 w-[3px] rounded-r bg-sand-500" aria-hidden />}
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-sand-600' : 'text-ink-3 group-hover:text-ink-2')} />
                {!collapsed && <span className="truncate uppercase tracking-[0.06em] text-[12px]">{item.label}</span>}
                {!collapsed && item.href === '/settings' && issues > 0 && (
                  <span className="ml-auto rounded-full bg-st-redBg px-1.5 text-2xs font-semibold text-st-red" title="Data quality errors">
                    {issues}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={toggle} className={cn('flex h-10 items-center gap-2 border-t border-line text-xs text-ink-3 hover:text-ink', collapsed ? 'justify-center' : 'px-4')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        {!collapsed && 'Collapse'}
      </button>
    </nav>
  );
}
