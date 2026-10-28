-- supabase/security.sql  (run once, after schema.sql)
-- Shared rate limiter: serverless instances don't share memory, the database does.
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table rate_limits enable row level security;   -- no policies: service role only

create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare h int;
begin
  insert into rate_limits (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end,
    hits         = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end
  returning hits into h;
  if random() < 0.01 then delete from rate_limits where window_start < now() - interval '1 day'; end if;
  return h <= p_limit;
end $$;
revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;
