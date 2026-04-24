-- Migration 048: Grant select on mv_last_24h_summary

GRANT SELECT ON mv_last_24h_summary TO authenticated, anon;
