export default function handler(_request, response) {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";

  response
    .status(200)
    .setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
    .json({
      configured: Boolean(url && anonKey),
      supabaseUrl: url,
      supabaseAnonKey: anonKey
    });
}
