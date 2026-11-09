import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@kivo/shared";

// Placeholder. B2 replaces this with the dashboard shell.
export default async function DashboardPage() {
  await auth.protect();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <UserButton />
    </main>
  );
}
