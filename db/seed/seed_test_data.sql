-- FlightReacts Bookings — test seed data
-- All test accounts use emails ending in @example.com
-- Test login password for every seeded account: TestPass123!  (bcrypt, cost 12 — same format as the app)
-- Re-runnable: it aborts if seed data already exists. Run cleanup_test_data.sql first to reseed.
-- Dates are relative to the day you run it, so "upcoming" flights stay upcoming.

begin;

do $$ begin
  if exists (select 1 from passenger where email like '%@example.com') then
    raise exception 'Seed data already present — run cleanup_test_data.sql first';
  end if;
end $$;

-- 1. Airports -------------------------------------------------------------
insert into airport (code, city, name, timezone) values
  ('YYZ','Toronto','Toronto Pearson International Airport','America/Toronto'),
  ('YUL','Montreal','Montréal–Trudeau International Airport','America/Toronto'),
  ('YOW','Ottawa','Ottawa Macdonald–Cartier International Airport','America/Toronto'),
  ('YVR','Vancouver','Vancouver International Airport','America/Vancouver'),
  ('YYC','Calgary','Calgary International Airport','America/Edmonton'),
  ('YHZ','Halifax','Halifax Stanfield International Airport','America/Halifax'),
  ('JFK','New York','John F. Kennedy International Airport','America/New_York'),
  ('LAX','Los Angeles','Los Angeles International Airport','America/Los_Angeles'),
  ('ORD','Chicago','O''Hare International Airport','America/Chicago'),
  ('LHR','London','Heathrow Airport','Europe/London')
on conflict (code) do nothing;

-- 2. Planes + seat maps ---------------------------------------------------
create temp table _layout (model text, tier text, row_from int, row_to int, letters text) on commit drop;
insert into _layout values
  ('Airbus A220-300','premium', 1, 3,'ABCD'),
  ('Airbus A220-300','standard',4, 8,'ABCDEF'),
  ('Airbus A220-300','economy', 9,20,'ABCDEF'),
  ('Boeing 737 MAX 8','premium', 1, 4,'ABCD'),
  ('Boeing 737 MAX 8','standard',5,10,'ABCDEF'),
  ('Boeing 737 MAX 8','economy',11,28,'ABCDEF'),
  ('Embraer E175','premium', 1, 3,'ACD'),
  ('Embraer E175','standard',4, 7,'ABCD'),
  ('Embraer E175','economy', 8,20,'ABCD'),
  ('Boeing 787-9','premium', 1, 6,'ADFK'),
  ('Boeing 787-9','standard',10,15,'ABCDEFGH'),
  ('Boeing 787-9','economy',20,40,'ABCDEFGHJK');

insert into plane (model, total_seats)
select model, sum((row_to-row_from+1)*length(letters)) from _layout group by model;

insert into seat (plane_id, seat_no, tier)
select p.id, r::text || substr(l.letters, i, 1), l.tier
from _layout l
join plane p on p.model = l.model
cross join lateral generate_series(l.row_from, l.row_to) r
cross join lateral generate_series(1, length(l.letters)) i;

-- 3. Flights (depart time is local to origin airport) ---------------------
insert into flight (flight_no, plane_id, origin, destination, depart_at, arrive_at, status,
                    premium_fare_cents, standard_fare_cents, economy_fare_cents)
select v.flight_no, p.id, v.origin, v.dest,
       ((current_date + v.day_offset) + v.dep_time) at time zone a.timezone,
       ((current_date + v.day_offset) + v.dep_time) at time zone a.timezone + make_interval(mins => v.mins),
       v.status, v.econ * 3, round(v.econ * 1.6)::int, v.econ
from (values
  ('FR101','Airbus A220-300','YYZ','YUL', -3, time '07:00',  75,'scheduled',12900),
  ('FR102','Airbus A220-300','YUL','YYZ', -3, time '18:30',  80,'scheduled',12900),
  ('FR201','Boeing 737 MAX 8','YYZ','YVR',-1, time '08:15', 300,'scheduled',34900),
  ('FR110','Airbus A220-300','YYZ','YOW',  1, time '06:45',  60,'scheduled', 9900),
  ('FR111','Airbus A220-300','YOW','YYZ',  1, time '19:10',  60,'scheduled', 9900),
  ('FR202','Boeing 737 MAX 8','YVR','YYZ', 2, time '07:30', 270,'scheduled',34900),
  ('FR301','Boeing 737 MAX 8','YYZ','YYC', 2, time '10:00', 240,'scheduled',27900),
  ('FR302','Boeing 737 MAX 8','YYC','YYZ', 3, time '15:45', 225,'scheduled',27900),
  ('FR401','Embraer E175','YYZ','YHZ',     3, time '09:20', 130,'scheduled',18900),
  ('FR402','Embraer E175','YHZ','YYZ',     4, time '13:00', 140,'scheduled',18900),
  ('FR501','Boeing 737 MAX 8','YYZ','JFK', 4, time '08:00',  95,'scheduled',21900),
  ('FR502','Boeing 737 MAX 8','JFK','YYZ', 4, time '17:30', 100,'scheduled',21900),
  ('FR601','Boeing 737 MAX 8','YYZ','LAX', 5, time '11:15', 330,'scheduled',39900),
  ('FR602','Boeing 737 MAX 8','LAX','YYZ', 6, time '13:40', 285,'scheduled',39900),
  ('FR801','Embraer E175','YYZ','ORD',     5, time '07:05', 120,'scheduled',15900),
  ('FR802','Embraer E175','ORD','YYZ',     5, time '16:20', 100,'scheduled',15900),
  ('FR701','Boeing 787-9','YYZ','LHR',     7, time '21:30', 420,'scheduled',79900),
  ('FR702','Boeing 787-9','LHR','YYZ',     8, time '10:15', 480,'scheduled',79900),
  ('FR901','Airbus A220-300','YUL','YYZ', 10, time '12:00',  80,'cancelled',12900),
  ('FR112','Airbus A220-300','YYZ','YOW', 14, time '06:45',  60,'scheduled', 9900)
) v(flight_no, model, origin, dest, day_offset, dep_time, mins, status, econ)
join plane p on p.model = v.model
join airport a on a.code = v.origin;

-- 4. Passengers (customers) + staff/admin ---------------------------------
insert into passenger (email, password_hash, full_name)
select e, '$2b$12$qsXaF.oqkuEhkgZ9PoBu0OhgBwGX0.jPa1Mz7u1Yfsi5isBpcNBdi', n
from (values
  ('alice.nguyen@example.com','Alice Nguyen'),
  ('ben.okafor@example.com','Ben Okafor'),
  ('chloe.martin@example.com','Chloe Martin'),
  ('daniel.rossi@example.com','Daniel Rossi'),
  ('emma.tremblay@example.com','Emma Tremblay'),
  ('farhan.ali@example.com','Farhan Ali'),
  ('hana.kim@example.com','Hana Kim'),
  ('isaac.cohen@example.com','Isaac Cohen'),
  ('jasmine.singh@example.com','Jasmine Singh'),
  ('kai.wilson@example.com','Kai Wilson'),
  ('nopurchases@example.com','Nora Empty'),          -- account with zero bookings
  ('staff.morgan@example.com','Morgan Lee'),
  ('staff.priya@example.com','Priya Desai'),
  ('admin.sam@example.com','Sam Admin')
) v(e, n);

insert into staff (passenger_id, employee_no, employee_type)
select p.id, v.emp, v.t
from (values
  ('staff.morgan@example.com','EMP1001','staff'),
  ('staff.priya@example.com','EMP1002','staff'),
  ('admin.sam@example.com','EMP9001','admin')
) v(e, emp, t)
join passenger p on p.email = v.e;

-- 5. Bookings -------------------------------------------------------------
-- kind: 'ok' = confirmed, 'checkin' = confirmed + checked in,
--       'cancel' = passenger cancelled (full refund), 'flightcx' = flight cancelled (full refund)
insert into passenger_seat (booking_ref, passenger_id, flight_id, seat_id, traveler_name,
    base_fare_cents, taxes_cents, fees_cents, checked_bags, bag_fees_cents, total_cents,
    payment_ref, status, created_at, cancelled_at, refund_cents, checked_in_at)
select b.ref, p.id, f.id, s.id, b.traveler,
       x.base, x.tax, 2500, b.bags, b.bags * 3500,
       x.base + x.tax + 2500 + b.bags * 3500,
       'TEST-PAY-' || b.ref,
       case when b.kind in ('cancel','flightcx') then 'cancelled' else 'confirmed' end,
       least(f.depart_at - interval '12 days', now() - interval '2 days'),
       case when b.kind in ('cancel','flightcx') then now() - interval '1 day' end,
       case when b.kind in ('cancel','flightcx') then x.base + x.tax + 2500 + b.bags * 3500 end,
       case when b.kind = 'checkin' then f.depart_at - interval '20 hours' end
from (values
  ('FRA1B2','alice.nguyen@example.com','FR101','3A','Alice Nguyen',1,'checkin'),
  ('FRA1B3','alice.nguyen@example.com','FR102','3A','Alice Nguyen',1,'checkin'),
  ('FRB2C3','ben.okafor@example.com','FR201','12C','Ben Okafor',0,'checkin'),
  ('FRB2C4','ben.okafor@example.com','FR201','12D','Grace Okafor',1,'checkin'),
  ('FRN4P5','emma.tremblay@example.com','FR201','4A','Emma Tremblay',2,'checkin'),
  ('FRC3D4','chloe.martin@example.com','FR110','1A','Chloe Martin',0,'ok'),
  ('FRC3D5','chloe.martin@example.com','FR111','1A','Chloe Martin',0,'ok'),
  ('FRD4E5','daniel.rossi@example.com','FR202','5A','Daniel Rossi',2,'ok'),
  ('FRE5F6','emma.tremblay@example.com','FR301','15B','Emma Tremblay',1,'ok'),
  ('FRE5F7','emma.tremblay@example.com','FR302','15B','Emma Tremblay',1,'ok'),
  ('FRF6G7','farhan.ali@example.com','FR401','2C','Farhan Ali',1,'ok'),
  ('FRM3N4','farhan.ali@example.com','FR502','22F','Farhan Ali',0,'ok'),
  ('FRG7H8','hana.kim@example.com','FR501','20A','Hana Kim',1,'ok'),
  ('FRG7H9','hana.kim@example.com','FR501','20B','Leo Kim',0,'ok'),
  ('FRH8J9','isaac.cohen@example.com','FR601','3B','Isaac Cohen',2,'ok'),
  ('FRH8K1','isaac.cohen@example.com','FR602','3B','Isaac Cohen',2,'ok'),
  ('FRJ9K2','jasmine.singh@example.com','FR701','1A','Jasmine Singh',2,'ok'),
  ('FRJ9K3','jasmine.singh@example.com','FR702','1A','Jasmine Singh',2,'ok'),
  ('FRK1L2','kai.wilson@example.com','FR801','10A','Kai Wilson',1,'cancel'),
  ('FRK1L3','kai.wilson@example.com','FR801','10A','Kai Wilson',0,'ok'),   -- same seat rebooked after cancel
  ('FRL2M3','daniel.rossi@example.com','FR901','6A','Daniel Rossi',0,'flightcx'),
  ('FRL2M4','alice.nguyen@example.com','FR901','6B','Alice Nguyen',1,'flightcx')
) b(ref, email, flight_no, seat_no, traveler, bags, kind)
join passenger p on p.email = b.email
join flight f on f.flight_no = b.flight_no
join seat s on s.plane_id = f.plane_id and s.seat_no = b.seat_no
cross join lateral (
  select case s.tier when 'premium' then f.premium_fare_cents
                     when 'standard' then f.standard_fare_cents
                     else f.economy_fare_cents end as base
) fare
cross join lateral (select fare.base as base, round(fare.base * 0.13)::int as tax) x;

-- Fill FR112 almost to capacity so "sold out" / seat-availability logic can be tested
insert into passenger_seat (booking_ref, passenger_id, flight_id, seat_id, traveler_name,
    base_fare_cents, taxes_cents, fees_cents, total_cents, payment_ref)
select 'FRX' || lpad(row_number() over (order by s.id)::text, 3, '0'),
       (select id from passenger where email = 'hana.kim@example.com'),
       f.id, s.id, 'Group Booking Traveler ' || row_number() over (order by s.id),
       f.economy_fare_cents, round(f.economy_fare_cents * 0.13)::int, 2500,
       f.economy_fare_cents + round(f.economy_fare_cents * 0.13)::int + 2500,
       'TEST-PAY-GROUP'
from flight f join seat s on s.plane_id = f.plane_id
where f.flight_no = 'FR112' and s.tier = 'economy' and s.seat_no not in ('20E','20F');

commit;
