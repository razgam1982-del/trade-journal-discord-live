-- "ערוץ ראשי" under the momentum-swing futures nostro category.
insert into channels (channel_id, name, template) values
  ('1334020841511456908', 'מומנטום סווינג חוזים נוסטרו', 'portfolio_risk')
on conflict (channel_id) do nothing;
