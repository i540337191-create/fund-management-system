-- Configuration-backed administrators have an actor ID but no users-table row.
alter table ai_intake_items add column submitted_by_actor_id text;
alter table ai_intake_items add column submitted_by_name_label text;
update ai_intake_items i
set submitted_by_actor_id=i.submitted_by_user_id,
    submitted_by_name_label=u.name
from users u where u.id=i.submitted_by_user_id;
