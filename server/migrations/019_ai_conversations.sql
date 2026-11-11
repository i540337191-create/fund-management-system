create table ai_conversations (
 id uuid primary key,
 owner_id text not null,
 payload jsonb not null,
 updated_at timestamptz not null default now()
);
create index ai_conversations_owner on ai_conversations(owner_id, updated_at desc);
