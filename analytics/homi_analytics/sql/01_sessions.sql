-- One row per session: who, on what, how long, and whether it converted.
-- A person is the signed-in user when known, otherwise the device.
CREATE OR REPLACE VIEW analytics.sessions AS
WITH per_session AS (
    SELECT
        session_id,
        min(occurred_at) AS started_at,
        max(occurred_at) AS ended_at,
        (array_agg(user_id ORDER BY occurred_at) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,
        (array_agg(anonymous_id ORDER BY occurred_at) FILTER (WHERE anonymous_id IS NOT NULL))[1]
            AS anonymous_id,
        (array_agg(platform ORDER BY occurred_at) FILTER (WHERE platform <> 'server'))[1] AS platform,
        count(*) AS event_count,
        bool_or(event_name = 'search_performed') AS searched,
        bool_or(event_name = 'viewing_requested') AS converted,
        bool_or(app_version = 'simulator') AS simulated
    FROM events
    WHERE session_id IS NOT NULL
    GROUP BY session_id
)
SELECT
    s.*,
    COALESCE(s.user_id, s.anonymous_id::text) AS person_id,
    COALESCE(u.is_demo, false) AS is_guest,
    s.started_at::date AS day
FROM per_session s
LEFT JOIN users u ON u.id = s.user_id;
