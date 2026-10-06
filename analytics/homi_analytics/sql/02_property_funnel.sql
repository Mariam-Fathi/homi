-- The core funnel table: one row per (session, property) the person encountered,
-- with a flag for each step reached. Counting pairs rather than events means opening
-- the same listing five times in one session counts once.
CREATE OR REPLACE VIEW analytics.property_funnel AS
WITH steps AS (
    SELECT
        session_id,
        properties ->> 'property_id' AS property_id,
        event_name,
        occurred_at
    FROM events
    WHERE session_id IS NOT NULL
      AND event_name IN (
          'property_impression', 'property_card_clicked', 'property_viewed',
          'favorite_added', 'viewing_form_opened', 'viewing_form_validation_failed',
          'viewing_form_abandoned', 'viewing_requested'
      )
)
SELECT
    st.session_id,
    st.property_id,
    p.type AS property_type,
    p.price,
    bool_or(event_name = 'property_impression') AS impressed,
    bool_or(event_name = 'property_card_clicked') AS clicked,
    bool_or(event_name = 'property_viewed') AS viewed,
    bool_or(event_name = 'favorite_added') AS favorited,
    bool_or(event_name = 'viewing_form_opened') AS form_opened,
    bool_or(event_name = 'viewing_form_validation_failed') AS form_validation_failed,
    bool_or(event_name = 'viewing_form_abandoned') AS form_abandoned,
    bool_or(event_name = 'viewing_requested') AS requested,
    min(occurred_at) AS first_seen_at
FROM steps st
JOIN properties p ON p.id = st.property_id
GROUP BY st.session_id, st.property_id, p.type, p.price;
