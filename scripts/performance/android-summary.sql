INCLUDE PERFETTO MODULE android.frames.timeline;
INCLUDE PERFETTO MODULE android.input;

-- Native completion durations are not FPS or target-screen readiness.
WITH app_frames AS (
  SELECT dur FROM android_frames
  WHERE process_name = 'com.bgo.boardgameorganizer.dev' AND dur > 0
), app_input AS (
  SELECT CASE WHEN total_latency_dur >= 0 THEN total_latency_dur END AS total_latency_dur,
    CASE WHEN end_to_end_latency_dur >= 0 THEN end_to_end_latency_dur END AS end_to_end_latency_dur
  FROM android_input_events
  WHERE process_name = 'com.bgo.boardgameorganizer.dev'
), quality AS (
  SELECT COALESCE(SUM(value), 0) AS issues FROM stats
  WHERE severity IN ('error', 'data_loss') AND value > 0
), measurements AS (
  SELECT 'trace_errors_or_data_loss' AS metric,
    CASE WHEN issues > 0 THEN 'invalid' ELSE 'ok' END AS status,
    issues AS samples, NULL AS p50_ms, NULL AS p95_ms FROM quality
  UNION ALL
  SELECT 'frame_completion', CASE WHEN COUNT(*) = 0 THEN 'unavailable' ELSE 'measured' END,
    COUNT(*), PERCENTILE(dur / 1e6, 50), PERCENTILE(dur / 1e6, 95) FROM app_frames
  UNION ALL
  SELECT 'frame_timeline_surface_records',
    CASE WHEN COUNT(*) = 0 THEN 'unavailable' ELSE 'measured' END,
    COUNT(*), NULL, NULL FROM actual_frame_timeline_slice
    JOIN process USING (upid)
    WHERE process.name = 'com.bgo.boardgameorganizer.dev' AND dur > 0
  UNION ALL
  SELECT 'input_dispatch_to_ack',
    CASE WHEN COUNT(total_latency_dur) = 0 THEN 'unavailable' ELSE 'measured' END,
    COUNT(total_latency_dur), PERCENTILE(total_latency_dur / 1e6, 50),
    PERCENTILE(total_latency_dur / 1e6, 95) FROM app_input
  UNION ALL
  SELECT 'input_to_associated_frame_present',
    CASE WHEN COUNT(end_to_end_latency_dur) = 0 THEN 'unavailable' ELSE 'measured' END,
    COUNT(end_to_end_latency_dur), PERCENTILE(end_to_end_latency_dur / 1e6, 50),
    PERCENTILE(end_to_end_latency_dur / 1e6, 95) FROM app_input
)
SELECT metric, status, samples, p50_ms, p95_ms FROM measurements;
