-- One row per search, with whether it found anything and whether the person went on
-- to open a property in the same session.
CREATE OR REPLACE VIEW analytics.searches AS
SELECT
    s.event_id,
    s.session_id,
    s.occurred_at,
    lower(trim(s.properties ->> 'query')) AS query,
    (s.properties ->> 'results_count')::int AS results_count,
    (s.properties ->> 'results_count')::int = 0 AS dead_end,
    EXISTS (
        SELECT 1
        FROM events v
        WHERE v.session_id = s.session_id
          AND v.event_name = 'property_viewed'
          AND v.occurred_at > s.occurred_at
    ) AS followed_by_view
FROM events s
WHERE s.event_name = 'search_performed';
