import { it, expect } from 'vitest';
import { TRANSIT_TIME_ZONE, transitHour } from '../localTime';
it('uses Grenada time across UTC dates and seasonal timezone changes',()=>{
 expect(transitHour(new Date('2026-10-07T03:15:00Z'))).toBe(23);
 expect(transitHour(new Date('2026-01-07T12:15:00Z'))).toBe(8);
 expect(transitHour(new Date('2026-07-07T12:15:00Z'))).toBe(8);
 expect(new Intl.DateTimeFormat('en-US',{timeZone:TRANSIT_TIME_ZONE,day:'numeric'}).format(new Date('2026-10-07T03:15:00Z'))).toBe('6');
});
