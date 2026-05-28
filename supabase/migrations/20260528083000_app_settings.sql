-- Key/value app settings. Seeded with the portfolio size used to convert
-- % of portfolio into dollars across the dashboard.
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values ('portfolio_size', '100000');

alter table app_settings enable row level security;
