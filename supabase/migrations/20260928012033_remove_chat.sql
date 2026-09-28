-- Student-tutor chat is removed entirely (operator decision, 2026-09-28).
-- Tutors and students do not message each other through the portal. The UI,
-- /api/chat, the admin lesson route's thread upsert and the tutor-deletion
-- check went in the same change. At removal the tables held one thread and no
-- messages. Dropping the tables takes their policies with them.

drop table if exists public.chat_messages;
drop table if exists public.chat_threads;

-- Only chat used these. private.tutor_has_thread_with stopped being referenced
-- when an accepted match replaced the chat thread as the tutor-student link.
drop function if exists private.can_access_chat_thread(bigint);
drop function if exists private.tutor_has_thread_with(uuid);
