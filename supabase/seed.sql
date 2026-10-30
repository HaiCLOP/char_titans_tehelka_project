-- Departments (routing targets). Aman: confirm names + SLA hours with real DU offices.
insert into departments (name_en, name_as, categories) values
 ('Estate & Maintenance', 'এষ্টেট আৰু ৰক্ষণাবেক্ষণ', '{plumbing,infrastructure}'),
 ('Electrical Section', 'বৈদ্যুতিক শাখা', '{electrical}'),
 ('Water & Sanitation', 'পানী আৰু চাফাই', '{water_supply,sanitation}'),
 ('Hostel Administration', 'হোষ্টেল প্ৰশাসন', '{hostel,mess_food}'),
 ('IT Cell', 'আইটি চেল', '{it_network}'),
 ('Academic Section', 'শৈক্ষিক শাখা', '{academic}'),
 ('Security Office', 'সুৰক্ষা কাৰ্যালয়', '{safety_security}'),
 ('Transport Section', 'পৰিবহণ শাখা', '{transport,other}');

-- Locations: PLACEHOLDERS. Aman replaces with real DU buildings, lat/lng and map_x/map_y.
insert into locations (name_en, name_as, type, map_x, map_y) values
 ('Central Library', 'কেন্দ্ৰীয় পুথিভঁৰাল', 'academic', 0.30, 0.32),
 ('Administrative Building', 'প্ৰশাসনিক ভৱন', 'admin', 0.68, 0.36),
 ('Centre for Computer Science & Applications', 'কম্পিউটাৰ বিজ্ঞান আৰু প্ৰয়োগ কেন্দ্ৰ', 'academic', 0.52, 0.40),
 ('Science Block', 'বিজ্ঞান ভৱন', 'academic', 0.50, 0.30),
 ('Auditorium', 'প্ৰেক্ষাগৃহ', 'event', 0.74, 0.68),
 ('Main Gate', 'মূল দুৱাৰ', 'gate', 0.62, 0.86),
 ('Boys Hostel', 'ল''ৰা হোষ্টেল', 'hostel', 0.34, 0.66),
 ('Girls Hostel', 'ছোৱালী হোষ্টেল', 'hostel', 0.22, 0.52),
 ('Canteen', 'কেণ্টিন', 'food', 0.44, 0.58),
 ('Playground', 'খেলপথাৰ', 'sports', 0.84, 0.50);

-- AI model chains per purpose. Model ids are editable in the system panel.
-- 'gemini-flash-latest' / 'gemini-flash-lite-latest' are Google aliases that track the newest models.
insert into ai_providers (provider, model, purpose, priority, caps) values
 ('google','gemini-flash-latest','intake',10,'{vision,assamese,json}'),
 ('google','gemini-flash-lite-latest','intake',20,'{vision,assamese,json}'),
 ('google','gemini-embedding-001','embed',10,'{embed}'),
 ('google','gemini-flash-lite-latest','dedup_verify',10,'{assamese,json}'),
 ('google','gemini-flash-latest','dedup_verify',20,'{assamese,json}'),
 ('google','gemini-flash-latest','agent',10,'{tools,assamese}'),
 ('google','gemini-flash-lite-latest','agent',20,'{tools,assamese}'),
 ('google','gemini-flash-latest','reply_draft',10,'{assamese}'),
 ('google','gemini-flash-lite-latest','translate_msg',10,'{assamese}'),
 ('google','gemini-flash-latest','translate_msg',20,'{assamese}'),
 ('google','gemini-flash-latest','resolution_check',10,'{vision,json}'),
 ('google','gemini-flash-latest','daily_brief',10,'{assamese}');

-- OpenRouter fallback (free models only; "auto:free" is expanded at runtime to currently free models)
insert into ai_providers (provider, model, purpose, priority, caps) values
 ('openrouter','auto:free','intake',90,'{vision,assamese,json}'),
 ('openrouter','auto:free','dedup_verify',90,'{assamese,json}'),
 ('openrouter','auto:free','agent',90,'{tools,assamese}'),
 ('openrouter','auto:free','reply_draft',90,'{assamese}'),
 ('openrouter','auto:free','translate_msg',90,'{assamese}'),
 ('openrouter','auto:free','daily_brief',90,'{assamese}');
