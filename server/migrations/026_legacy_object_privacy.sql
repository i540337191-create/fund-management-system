-- Legacy imports were made public by migration 020. Preserve deliberate edits and new user-created shares.
-- Owners retain access through ObjectPolicy; explicit members and project overrides are unchanged.
update object_access_state s
set payload=jsonb_set(s.payload,'{funds}',coalesce((
  select jsonb_object_agg(e.key,case
    when e.value->>'visibility'='public' and e.value->>'revision'='1'
      and exists(select 1 from funds f where f.id=e.key and f.data_origin in ('seed_demo','source_pdf_ocr','source_file','unknown'))
    then e.value || jsonb_build_object('visibility','members','revision',2)
    else e.value end)
  from jsonb_each(s.payload->'funds') e
),'{}'::jsonb))
where s.id=true;
