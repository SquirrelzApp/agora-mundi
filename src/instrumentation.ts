export async function register() {
  // On Vercel serverless, hourly GitHub Actions runs cron-sync directly against PostgreSQL;
  // on long-running Node servers (VPS / Docker / local), run the in-process scheduler.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startBackgroundNewsScheduler } = await import(
      "@/lib/news-scheduler"
    );
    startBackgroundNewsScheduler();
  }
}
