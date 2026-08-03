import { Outlet, Link } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      {/* Logo */}
      <div className="mb-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">E</span>
          </div>
          <span className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            E-Formation
          </span>
        </Link>
      </div>

      {/* Auth Content */}
      <div className="w-full max-w-md px-4">
        <Outlet />
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} E-Formation. Tous droits réservés.</p>
      </div>
    </div>
  )
}
