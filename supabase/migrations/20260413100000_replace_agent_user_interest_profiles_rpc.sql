create or replace function public.replace_agent_user_interest_profiles(
  p_user_ids uuid[],
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return 0;
  end if;

  delete from public.agent_user_interest_profiles
  where user_id = any(p_user_ids);

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 0 then
    insert into public.agent_user_interest_profiles (
      user_id,
      interest_type,
      interest_key,
      score,
      evidence
    )
    select
      row_data.user_id,
      row_data.interest_type,
      row_data.interest_key,
      row_data.score,
      coalesce(row_data.evidence, '{}'::jsonb)
    from jsonb_to_recordset(p_rows) as row_data(
      user_id uuid,
      interest_type text,
      interest_key text,
      score numeric,
      evidence jsonb
    );

    get diagnostics v_inserted = row_count;
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.replace_agent_user_interest_profiles(uuid[], jsonb) from public;
grant execute on function public.replace_agent_user_interest_profiles(uuid[], jsonb) to service_role;

