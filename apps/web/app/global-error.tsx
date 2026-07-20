"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body className="grid min-h-screen place-items-center bg-neutral-950 p-6 text-center">
        <div className="space-y-3">
          <h1 className="text-lg text-neutral-200">Algo salió mal</h1>
          <button
            onClick={reset}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-800"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
