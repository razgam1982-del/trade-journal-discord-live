-- Each monitored Discord channel is its own journal, with a parsing template.
create table channels (
  channel_id text primary key,
  name text not null,
  template text not null default 'portfolio_risk', -- 'portfolio_risk' | 'momentum_stocks'
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into channels (channel_id, name, template) values
  ('1488604363260952767', 'עסקאות-נדירות-מיוחדות', 'portfolio_risk'),
  ('1509385547888464012', 'בוט-בדיקות', 'portfolio_risk');

alter table channels enable row level security;
