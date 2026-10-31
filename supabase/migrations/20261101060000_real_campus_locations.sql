-- Real Dibrugarh University places from the campus map kit (OpenStreetMap / Overture / reviewed public pins,
-- see public/campus/ATTRIBUTION.txt). map_x/map_y = local metres / map extent (3141.49 x 2357.16 m), so
-- x_m = map_x * 3141.49 and y_m = map_y * 2357.16 in public/campus/map-data.json. lat/lng are WGS84.
-- NOTE: name_as was written by hand (ৰ/ৱ, no Bengali ra); it still needs a native-speaker read before the demo.
-- Idempotent: the 10 seed placeholders are updated in place (their ids are referenced by complaints and
-- profiles.coverage_location_ids); every other campus place is inserted only if its name_en is new.

-- Pixel character avatar (0-59 in /campus/team-characters.webp); null = derived from the user id in the app.
alter table profiles add column if not exists avatar_character smallint
  check (avatar_character between 0 and 59);

update locations l set name_en = v.name_en, name_as = v.name_as, type = v.type, lat = v.lat, lng = v.lng, map_x = v.map_x, map_y = v.map_y
from (values
 ('64c66c1d-6708-4ed3-849c-79fa40512d71'::uuid, 'Administrative Building', 'প্ৰশাসনিক ভৱন', 'admin', 27.4492486, 94.8972003, 0.603986, 0.50055),
 ('55a635e4-7d7b-4092-a160-3af42d70d565'::uuid, 'Aideu Handique Girls Hostel', 'আইদেউ হেণ্ডিক ছোৱালী হোষ্টেল', 'hostel', 27.446639, 94.8995632, 0.679743, 0.621704),
 ('e59e8be5-2b3a-4a24-824e-d3fac2bacb06'::uuid, 'Bulbuli Canteen', 'বুলবুলি কেণ্টিন', 'food', 27.4490327, 94.8957407, 0.558174, 0.511633),
 ('aea07b88-b6f5-413b-a801-3a1d51d66753'::uuid, 'Centre for Computer Science and Applications', 'কম্পিউটাৰ বিজ্ঞান আৰু প্ৰয়োগ কেন্দ্ৰ', 'academic', 27.4494496, 94.8949523, 0.533142, 0.492541),
 ('884f5be8-89d8-4acb-82a7-e8a1caf02dac'::uuid, 'Department of Chemistry', 'ৰসায়ন বিজ্ঞান বিভাগ', 'academic', 27.448067, 94.8953513, 0.546441, 0.557276),
 ('9862134f-eb63-475d-bef4-867001d1ab55'::uuid, 'Dibrugarh University Residential Campus Gate', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় আৱাসিক চৌহদৰ দুৱাৰ', 'gate', 27.4519703, 94.8887219, 0.335748, 0.37803),
 ('ef6c1368-93df-4136-a108-f39b4630e55d'::uuid, 'DU New Playground', 'ডি.ইউ. নতুন খেলপথাৰ', 'sports', 27.449001, 94.9009554, 0.722276, 0.509782),
 ('6a6c7176-c451-4f67-8399-253e81eb0839'::uuid, 'Lakshminath Bezbaroa Library', 'লক্ষ্মীনাথ বেজবৰুৱা পুথিভঁৰাল', 'academic', 27.4480527, 94.8963403, 0.577569, 0.557316),
 ('4a454d20-38f5-4ac3-bd71-03c4b952e60a'::uuid, 'Padmanath Gohain Baruah Chatra Nivas (PNGBCN)', 'পদ্মনাথ গোহাঞিবৰুৱা ছাত্ৰ নিৱাস (PNGBCN)', 'hostel', 27.4514408, 94.8992517, 0.667352, 0.396189),
 ('5aa5addd-ce95-4433-8fb4-29f4a510f5f3'::uuid, 'Rangghar Auditorium', 'ৰংঘৰ প্ৰেক্ষাগৃহ', 'event', 27.4496013, 94.8962796, 0.574825, 0.48456)
) as v(id, name_en, name_as, type, lat, lng, map_x, map_y)
where l.id = v.id;

insert into locations (name_en, name_as, type, lat, lng, map_x, map_y)
select v.name_en, v.name_as, v.type, v.lat, v.lng, v.map_x, v.map_y from (values
 ('Activity Centre, D.U.', 'ডি.ইউ. কাৰ্যকলাপ কেন্দ্ৰ', 'event', 27.4491923, 94.8938271, 0.497876, 0.505355),
 ('Ankuran Day Care Centre', 'অংকুৰণ শিশু পৰিচৰ্যা কেন্দ্ৰ', 'other', 27.4504565, 94.8922175, 0.446549, 0.446958),
 ('APDCN (Amal Prabha Das Chatri Nivas)', 'অমলপ্ৰভা দাস ছাত্ৰী নিৱাস (APDCN)', 'hostel', 27.4483213, 94.8886789, 0.336351, 0.549583),
 ('Bhimbor Deori Indoor Stadium', 'ভীমবৰ দেউৰী ইনড''ৰ ষ্টেডিয়াম', 'sports', 27.4499837, 94.8980312, 0.629734, 0.465464),
 ('Central Sophisticated Instrumentation Centre', 'কেন্দ্ৰীয় উন্নত যন্ত্ৰপাতি কেন্দ্ৰ', 'academic', 27.451733, 94.89144, 0.4214, 0.387451),
 ('Centre for Atmospheric Studies', 'বায়ুমণ্ডলীয় অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4474767, 94.8943448, 0.515088, 0.585668),
 ('Centre for Biotechnology and Bioinformatics', 'জৈৱপ্ৰযুক্তি আৰু জৈৱ-তথ্যবিজ্ঞান কেন্দ্ৰ', 'academic', 27.450697, 94.8944905, 0.517941, 0.4342),
 ('Centre for Distance and Online Education', 'দূৰ আৰু অনলাইন শিক্ষা কেন্দ্ৰ', 'academic', 27.4482976, 94.8926527, 0.461403, 0.548162),
 ('Centre for Juridical Studies', 'আইন অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4486367, 94.8921843, 0.446482, 0.532521),
 ('Centre for Library and Information Science Studies', 'পুথিভঁৰাল আৰু তথ্য বিজ্ঞান অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4479825, 94.8964587, 0.581332, 0.56054),
 ('Centre for Management Studies', 'ব্যৱস্থাপনা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4522657, 94.8962116, 0.571251, 0.35936),
 ('Centre for Social Work Studies', 'সমাজকৰ্ম অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4514339, 94.8971997, 0.60279, 0.397828),
 ('Centre for Studies in Journalism and Mass Communication', 'সাংবাদিকতা আৰু গণসংযোগ অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4494674, 94.8944668, 0.517856, 0.492014),
 ('Centre for Studies in Philosophy', 'দৰ্শন অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4504511, 94.8954013, 0.546732, 0.445176),
 ('Centre for Tea and Agro Studies', 'চাহ আৰু কৃষি অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4486889, 94.8928622, 0.467785, 0.529634),
 ('China Gate', 'চায়না দুৱাৰ', 'gate', 27.4532856, 94.8954858, 0.547865, 0.311883),
 ('Dean''s Office', 'ডীনৰ কাৰ্যালয়', 'admin', 27.4485109, 94.8982481, 0.637353, 0.534556),
 ('Department of Anthropology', 'নৃতত্ত্ব বিভাগ', 'academic', 27.4491548, 94.8952622, 0.543052, 0.5062),
 ('Department of Applied Geology', 'প্ৰয়োগিক ভূতত্ত্ব বিভাগ', 'academic', 27.4491438, 94.8930597, 0.473755, 0.508125),
 ('Department of Applied Psychology', 'প্ৰয়োগিক মনোবিজ্ঞান বিভাগ', 'academic', 27.4493409, 94.8945219, 0.519658, 0.497925),
 ('Department of Assamese', 'অসমীয়া বিভাগ', 'academic', 27.451347, 94.8961637, 0.570239, 0.402576),
 ('Department of Bodo', 'বড়ো বিভাগ', 'academic', 27.4519343, 94.8972712, 0.60477, 0.37426),
 ('Department of Commerce', 'বাণিজ্য বিভাগ', 'academic', 27.4515957, 94.8964489, 0.579079, 0.390703),
 ('Department of Computer Science and Engineering, DUIET', 'কম্পিউটাৰ বিজ্ঞান আৰু অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4518772, 94.8913756, 0.419296, 0.380714),
 ('Department of Economics', 'অৰ্থনীতি বিভাগ', 'academic', 27.451618, 94.8966877, 0.58658, 0.389502),
 ('Department of Education', 'শিক্ষা বিভাগ', 'academic', 27.4510732, 94.8928803, 0.467073, 0.417546),
 ('Department of Electronics and Communication Engineering, DUIET', 'ইলেক্ট্ৰনিক্স আৰু সংযোগ অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4517885, 94.8909662, 0.406462, 0.385144),
 ('Department of English', 'ইংৰাজী বিভাগ', 'academic', 27.4507933, 94.8965003, 0.581128, 0.428388),
 ('Department of Geography', 'ভূগোল বিভাগ', 'academic', 27.450837, 94.8968379, 0.591727, 0.426117),
 ('Department of History', 'ইতিহাস বিভাগ', 'academic', 27.4513626, 94.8961887, 0.571017, 0.401826),
 ('Department of Life Sciences', 'জীৱ বিজ্ঞান বিভাগ', 'academic', 27.4508075, 94.8944118, 0.515405, 0.429056),
 ('Department of Mathematics', 'গণিত বিভাগ', 'academic', 27.4496371, 94.894834, 0.529319, 0.483802),
 ('Department of Petroleum Engineering, DUIET', 'পেট্ৰ''লিয়াম অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4508528, 94.8909022, 0.40495, 0.429169),
 ('Department of Petroleum Technology', 'পেট্ৰ''লিয়াম প্ৰযুক্তি বিভাগ', 'academic', 27.4497189, 94.8921832, 0.445866, 0.481651),
 ('Department of Pharmaceutical Sciences', 'ঔষধ বিজ্ঞান বিভাগ', 'academic', 27.4504003, 94.8912331, 0.415605, 0.450228),
 ('Department of Physics', 'পদাৰ্থ বিজ্ঞান বিভাগ', 'academic', 27.4478965, 94.8945959, 0.522763, 0.565774),
 ('Department of Political Science', 'ৰাজনীতি বিজ্ঞান বিভাগ', 'academic', 27.450873, 94.8965529, 0.58274, 0.424608),
 ('Department of Sociology', 'সমাজতত্ত্ব বিভাগ', 'academic', 27.451236, 94.8970337, 0.597673, 0.407236),
 ('Department of Statistics', 'পৰিসংখ্যা বিজ্ঞান বিভাগ', 'academic', 27.4496901, 94.8951203, 0.538299, 0.481128),
 ('Dibrugarh University Institute of Engineering and Technology (DUIET)', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় অভিযান্ত্ৰিক আৰু প্ৰযুক্তি প্ৰতিষ্ঠান (DUIET)', 'academic', 27.4513607, 94.8898846, 0.372659, 0.405944),
 ('Dibrugarh University Old Park', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় পুৰণি উদ্যান', 'sports', 27.4492194, 94.8917665, 0.433023, 0.505397),
 ('Dibrugarh University Post Office', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় ডাকঘৰ', 'other', 27.4489063, 94.8923676, 0.452105, 0.519731),
 ('Dibrugarh University Tea Estate', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় চাহ বাগিচা', 'other', 27.4520194, 94.8842335, 0.194495, 0.37858),
 ('Dr. Bhupen Hazarika Centre for Studies in Performing Arts', 'ড° ভূপেন হাজৰিকা পৰিৱেশ্য কলা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.452923, 94.8959162, 0.561603, 0.328652),
 ('DU Gymnasium', 'ডি.ইউ. ব্যায়ামাগাৰ', 'sports', 27.4499227, 94.898514, 0.644959, 0.468022),
 ('DU Haat', 'ডি.ইউ. হাট', 'food', 27.4473019, 94.892023, 0.442124, 0.595368),
 ('DU Health Centre', 'ডি.ইউ. স্বাস্থ্য কেন্দ্ৰ', 'health', 27.446934, 94.8986363, 0.650418, 0.608431),
 ('DU Model School', 'ডি.ইউ. আৰ্হি বিদ্যালয়', 'other', 27.4472389, 94.8910001, 0.409971, 0.598982),
 ('DU Park', 'ডি.ইউ. উদ্যান', 'sports', 27.4458108, 94.8979524, 0.629503, 0.661667),
 ('DUIET Cafeteria', 'DUIET কেণ্টিন', 'food', 27.4514407, 94.8915479, 0.424952, 0.401122),
 ('DUPGSU Office', 'DUPGSU কাৰ্যালয়', 'admin', 27.448926, 94.8981616, 0.634407, 0.515099),
 ('DUTA House', 'DUTA ভৱন', 'other', 27.4463449, 94.8962388, 0.575294, 0.637658),
 ('Guruprasad Das Chatra Nivas (GPDCN)', 'গুৰুপ্ৰসাদ দাস ছাত্ৰ নিৱাস (GPDCN)', 'hostel', 27.4522559, 94.8931241, 0.474109, 0.361795),
 ('JO SAG', 'জ'' ছাগ', 'food', 27.4477963, 94.8981465, 0.634541, 0.568211),
 ('Joymati Chatri Nibash Gate', 'জয়মতী ছাত্ৰী নিৱাস দুৱাৰ', 'gate', 27.4467489, 94.900584, 0.711805, 0.615883),
 ('Juti Canteen', 'জুতি কেণ্টিন', 'food', 27.4513878, 94.8966793, 0.58644, 0.400328),
 ('Lummer Dai Chatra Nivas (LDCN)', 'লুম্মেৰ দাই ছাত্ৰ নিৱাস (LDCN)', 'hostel', 27.4516957, 94.8931221, 0.474347, 0.38813),
 ('Maffizzudin Ahmed Hazarika Chatra Nivas', 'মফিজুদ্দিন আহমেদ হাজৰিকা ছাত্ৰ নিৱাস', 'hostel', 27.452223, 94.898845, 0.654134, 0.359681),
 ('Miles Bronson Chatra Niwas', 'মাইলছ ব্ৰনছন ছাত্ৰ নিৱাস', 'hostel', 27.4536028, 94.8983178, 0.636802, 0.295159),
 ('Nalinibala Devi Chatri Nivas', 'নলিনীবালা দেৱী ছাত্ৰী নিৱাস', 'hostel', 27.4473557, 94.9013258, 0.734819, 0.586884),
 ('Padmakumari Gohain Women''s Hostel', 'পদ্মকুমাৰী গোহাঞি মহিলা হোষ্টেল', 'hostel', 27.4470096, 94.9002212, 0.700248, 0.603862),
 ('Pavilion Play Ground No. 1', 'পেভিলিয়ন খেলপথাৰ নং ১', 'sports', 27.4497852, 94.8930308, 0.472501, 0.477994),
 ('Punjab National Bank', 'পাঞ্জাব নেচনেল বেংক', 'other', 27.4506061, 94.8940709, 0.504787, 0.438741),
 ('Puspalata Das Chatri Nivas (PDCN)', 'পুষ্পলতা দাস ছাত্ৰী নিৱাস (PDCN)', 'hostel', 27.4475386, 94.9016076, 0.743588, 0.578106),
 ('SBI ATM (near Post Office)', 'SBI এ.টি.এম. (ডাকঘৰৰ ওচৰত)', 'other', 27.4489596, 94.8920596, 0.442385, 0.517422),
 ('SBI ATM (near Administrative Building)', 'SBI এ.টি.এম. (প্ৰশাসনিক ভৱনৰ ওচৰত)', 'other', 27.4495, 94.8979, 0.625867, 0.488285),
 ('SBI Branch, Dibrugarh University', 'SBI শাখা, ডিব্ৰুগড় বিশ্ববিদ্যালয়', 'other', 27.4514665, 94.890255, 0.384257, 0.400734),
 ('Swarnalata Baruah Chatri Nivas (SLBCN)', 'স্বৰ্ণলতা বৰুৱা ছাত্ৰী নিৱাস (SLBCN)', 'hostel', 27.4470745, 94.9010056, 0.724895, 0.600308),
 ('UGC''s Centre for Women''s Studies', 'ইউ.জি.চি. মহিলা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4508791, 94.895216, 0.540671, 0.425176),
 ('University Park', 'বিশ্ববিদ্যালয় উদ্যান', 'sports', 27.4463568, 94.8978904, 0.627258, 0.636041),
 ('University Science Instrumentation Centre', 'বিশ্ববিদ্যালয় বিজ্ঞান যন্ত্ৰপাতি কেন্দ্ৰ', 'academic', 27.4478171, 94.8939934, 0.503848, 0.569891),
 ('Vice-Chancellor''s Office', 'উপাচাৰ্যৰ কাৰ্যালয়', 'admin', 27.4496373, 94.8973141, 0.607357, 0.482206),
 ('Vishranta Guest House', 'বিশ্ৰান্ত অতিথিশালা', 'other', 27.4459063, 94.8962703, 0.576521, 0.658255)
) as v(name_en, name_as, type, lat, lng, map_x, map_y)
where not exists (select 1 from locations l where l.name_en = v.name_en);
