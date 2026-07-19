const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6">
      <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-widest text-neutral-400">
        Fase 1 · Ingesta
      </span>
      <h1 className="text-4xl font-semibold tracking-tight">ClipLab</h1>
      <p className="text-neutral-400">
        Scaffold del monorepo listo. Próximo paso: autenticación, upload
        multipart resumible, metadata con ffprobe y el player.
      </p>
      <ul className="space-y-1 text-sm text-neutral-500">
        <li>• API health: {API_URL}/health/ready</li>
        <li>• API docs (OpenAPI): {API_URL}/docs</li>
      </ul>
    </main>
  );
}
