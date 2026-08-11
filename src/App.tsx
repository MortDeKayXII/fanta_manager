import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { AppShell } from '@/components/AppShell'
import { SessionProvider } from '@/store/session'
import { DashboardScreen } from '@/screens/DashboardScreen'
import { LiveDraftScreen } from '@/screens/LiveDraftScreen'
import { PrepBoardScreen } from '@/screens/PrepBoardScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { SetupScreen } from '@/screens/SetupScreen'
import { StrategyBuilderScreen } from '@/screens/StrategyBuilderScreen'
import SimulationDraftScreen from '@/screens/SimulationDraftScreen'

/** The six screens of spec §6. */
const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/live" replace /> },
        { path: 'setup', element: <SetupScreen /> },
        { path: 'prep', element: <PrepBoardScreen /> },
        { path: 'strategy', element: <StrategyBuilderScreen /> },
        { path: 'simulate', element: <SimulationDraftScreen /> },
        { path: 'live', element: <LiveDraftScreen /> },
        { path: 'dashboard', element: <DashboardScreen /> },
        { path: 'settings', element: <SettingsScreen /> },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
)

export default function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
