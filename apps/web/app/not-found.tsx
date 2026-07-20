import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-950 p-6 text-center">
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-widest text-neutral-500">404</p>
        <h1 className="text-lg text-neutral-200">Página no encontrada</h1>
        <Link
          href="/"
          className="inline-block rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-800"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
