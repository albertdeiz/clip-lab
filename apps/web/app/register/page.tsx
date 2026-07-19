import { AuthForm } from "../components/auth-form";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <AuthForm mode="register" />
    </main>
  );
}
