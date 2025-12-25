export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Route protection is enforced by middleware (edge) + server-side API auth.
  return <>{children}</>;
}
