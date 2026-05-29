-- Hide the "בוט-בדיקות" test channel from the live journals (kept, just disabled).
update channels set enabled = false where channel_id = '1509385547888464012';
