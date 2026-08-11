import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import {
  BarChart3,
  ClipboardList,
  Gavel,
  LayoutGrid,
  Settings as SettingsIcon,
  Upload,
} from 'lucide-react'

import { BudgetPill } from '@/components/meters'
import { useSession } from '@/store/session'

const NAV = [
  { to: '/setup', label: 'Setup', icon: Upload },
  { to: '/prep', label: 'Prep', icon: ClipboardList },
  { to: '/strategy', label: 'Strategie', icon: LayoutGrid },
  { to: '/live', label: 'Asta live', icon: Gavel, primary: true },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/settings', label: 'Impostazioni', icon: SettingsIcon },
]

export function AppShell() {
  const { session, myTeam, financeOf, squadSize, loading } = useSession()
  const finance = financeOf(myTeam.id)

  // The very first render shows the demo fixture as placeholder state while
  // IndexedDB resolves (store/session.tsx); without this gate a real
  // multi-session user briefly sees stale/wrong data flash before their own
  // session loads.
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-(--color-fg-subtle)">Caricamento sessione…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-(--color-border) bg-(--color-surface) px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold tracking-tight">
            FantaDraft Assistant
          </span>
          <span className="truncate text-xs text-(--color-fg-subtle)">
            {session.name}
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon, primary }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-(--color-surface-3) text-(--color-fg)'
                    : 'text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)',
                  primary && 'font-medium',
                )
              }
            >
              <Icon size={15} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-(--color-fg-subtle)">{myTeam.name}</span>
          <span className="rounded-md bg-(--color-surface-2) px-2 py-1 text-xs text-(--color-fg-muted)">
            {finance.rosterSize}/{squadSize}
          </span>
          <BudgetPill remaining={finance.remaining} total={myTeam.budget_total} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
