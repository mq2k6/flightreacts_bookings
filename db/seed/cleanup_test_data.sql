-- Removes everything seed_test_data.sql inserted. Leaves any real accounts/data alone.
begin;

delete from passenger_seat
where passenger_id in (select id from passenger where email like '%@example.com')
   or booking_ref like 'FR%' and payment_ref like 'TEST-PAY-%';

delete from passenger where email like '%@example.com';   -- staff rows cascade

delete from flight
where flight_no in ('FR101','FR102','FR201','FR110','FR111','FR202','FR301','FR302','FR401','FR402',
                    'FR501','FR502','FR601','FR602','FR801','FR802','FR701','FR702','FR901','FR112')
  and not exists (select 1 from passenger_seat ps where ps.flight_id = flight.id);

delete from plane   -- seats cascade
where model in ('Airbus A220-300','Boeing 737 MAX 8','Embraer E175','Boeing 787-9')
  and not exists (select 1 from flight f where f.plane_id = plane.id);

delete from airport
where code in ('YYZ','YUL','YOW','YVR','YYC','YHZ','JFK','LAX','ORD','LHR')
  and not exists (select 1 from flight f where f.origin = airport.code or f.destination = airport.code);

commit;
