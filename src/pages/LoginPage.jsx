import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Eye,
  EyeOff,
  MessageSquareHeart,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';

export function LoginPage() {
  const { login, register, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setFieldErrors({});
    clearAuthError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearAuthError();

    const nextErrors = {};
    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (mode === 'register' && !cleanName) {
      nextErrors.name = 'Full name is required.';
    }
    if (!cleanEmail) {
      nextErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!password) {
      nextErrors.password = 'Password is required.';
    } else if (mode === 'register' && password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register({ name: cleanName, email: cleanEmail, password });
      } else {
        await login({ email: cleanEmail, password });
      }
    } catch {
      // AuthContext populates authError for UI display
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6faf8] flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Brand & Clinical Overview */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-emerald-100 p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                Sweety
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight mb-4">
              Calm, structured blood glucose tracking for everyday clarity.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl mb-8">
              Log your four daily readings—fasting and post-meal—review monthly trends with clinical precision, and explore pattern insights with an AI care companion.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6 border-t border-slate-100">
              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900 mb-1">
                  Four Daily Slots
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Structured fasting, breakfast, lunch, and dinner checks with strict 40–600 mg/dL validation.
                </p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900 mb-1">
                  Monthly Reports
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Instant daily, month-to-date, and previous-month summaries with one-decimal averages.
                </p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                  <MessageSquareHeart className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900 mb-1">
                  Care Assistant
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Review fasting vs post-meal trends and ask questions grounded in your own readings.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-8 pt-4 border-t border-slate-100">
            Personal wellness tracking only. Always consult your clinician for medical decisions.
          </p>
        </div>

        {/* Right Sign-In / Registration Card */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-emerald-100 p-8 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-emerald-50/70 border border-emerald-100 mb-6"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => switchMode('login')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-emerald-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => switchMode('register')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-emerald-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create account
              </button>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-1.5">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {mode === 'login'
                ? 'Sign in to access your private blood glucose log and reports.'
                : 'Start tracking your four daily readings in a private PostgreSQL ledger.'}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Full name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Maya Lin"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-rose-700">{fieldErrors.name}</p>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: '' }));
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-rose-700">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-rose-700">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 transition-colors shadow-xs"
            >
              {submitting
                ? mode === 'register'
                  ? 'Creating account...'
                  : 'Signing in...'
                : mode === 'register'
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
            <p>Protected with JWT session tokens and bcrypt password hashing.</p>
            <p>Supports up to 4 validated readings per day across fasting and meal slots.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
