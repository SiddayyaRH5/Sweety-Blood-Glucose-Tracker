import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Clock,
  LogOut,
  Menu,
  MessageSquareHeart,
  Plus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Activity },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/history', label: 'Readings Log', icon: Clock },
  { to: '/assistant', label: 'Care Assistant', icon: MessageSquareHeart },
];

export function Layout({ children, onOpenNewReading }) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const initials = (user?.name || 'S')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f6faf8] text-slate-900 flex flex-col lg:flex-row">
      {/* Mobile Compact Header (< 15% viewport height) */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-white border-b border-emerald-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-emerald-50 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Sweety
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenNewReading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Log Reading</span>
        </button>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-72 max-w-[85vw] bg-white h-full border-r border-emerald-100 flex flex-col justify-between p-5">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-xl font-bold tracking-tight text-slate-900">
                  Sweety
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav aria-label="Main navigation" className="space-y-1">
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-900 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-between bg-white border-r border-emerald-100/90 min-h-screen sticky top-0 h-screen p-5">
        <div className="space-y-6">
          <div className="px-2 pt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Sweety
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenNewReading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors shadow-xs whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Log Reading</span>
          </button>

          <nav aria-label="Main navigation" className="space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
