-- Daily headline numbers.
CREATE OR REPLACE VIEW analytics.daily_kpis AS
SELECT
    day,
    count(*) AS sessions,
    count(DISTINCT person_id) AS people,
    count(*) FILTER (WHERE converted) AS converted_sessions,
    round(avg(converted::int)::numeric, 4) AS session_conversion
FROM analytics.sessions
GROUP BY day
ORDER BY day;
