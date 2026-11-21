-- Save the existing chat turn and identify a project's first saved reply.
-- Existing callers retain the original save_chat_turn contract.

create function public.save_chat_turn_with_first_chat(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns table (conversation_id uuid, first_chat_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_first_chat_at timestamptz;
  v_has_saved_reply boolean;
begin
  -- Serialize the history check and save for this project. The weaker row
  -- lock is compatible with foreign-key checks on the project id.
  perform 1 from public.projects p where p.id = p_project_id for no key update;

  select exists (
    select 1
    from public.conversations c
    join public.messages m on m.conversation_id = c.id
    where c.project_id = p_project_id and m.role = 'bot'
  ) into v_has_saved_reply;

  v_conversation_id := public.save_chat_turn(
    p_project_id, p_conversation_id, p_visitor_id, p_visitor_message, p_bot_reply
  );

  if not v_has_saved_reply then
    select m.created_at into v_first_chat_at
    from public.messages m
    where m.conversation_id = v_conversation_id and m.role = 'bot'
    order by m.created_at desc
    limit 1;
  end if;

  return query select v_conversation_id, v_first_chat_at;
end;
$$;

revoke execute on function public.save_chat_turn_with_first_chat(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_chat_turn_with_first_chat(uuid, uuid, text, text, text)
  to service_role;
