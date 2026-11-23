import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';

// Workshop jobs through entityAccess: the work done on a bus or car
// (WorkshopJob) and the parts used on it (WorkshopJobPart). The stock itself
// moves in the database (tools/workshop-stock-check.mjs tests that part).
const call = (sdk, body) => load('entityAccess', sdk).default(request(body));
const json = async (res) => ({ status: res.status, body: await res.json() });

function workshop(role) {
  const sdk = mock(role);
  sdk.tables.VehicleGuide = [{ id: 'g1', make: 'Toyota', model: 'Hiace' }, { id: 'g2', make: 'BMW', model: 'X3' }];
  sdk.tables.WorkshopVehicle = [{ id: 'car-1', name: 'BMW X3', make: 'BMW', model: 'X3', year: 2013 }];
  sdk.tables.TorqueSpec = [
    { id: 't1', guide_id: 'g1', system: 'wheels_brakes', item: 'Caliper bracket bolts', nm: 107 },
    { id: 't2', guide_id: 'g2', system: 'wheels_brakes', item: 'Wheel bolts', nm: 140 },
  ];
  sdk.tables.Fault = [
    { id: 'f1', vehicle_id: 'bus-a', company_id: 'a', title: 'Brakes squeal', status: 'open' },
    { id: 'f2', vehicle_id: 'bus-b', company_id: 'b', title: 'Door stuck', status: 'open' },
  ];
  sdk.tables.Part = [{ id: 'p1', part_name: 'Brake pads (front)', oem_number: '04465-26420', quantity_in_stock: 2 }];
  sdk.tables.WorkshopJob = [
    { id: 'j-open', vehicle_kind: 'bus', vehicle_id: 'bus-a', vehicle_name: 'Bus A', guide_id: 'g1', title: 'Front brakes', status: 'open' },
    { id: 'j-done', vehicle_kind: 'car', vehicle_id: 'car-1', vehicle_name: 'BMW X3', guide_id: 'g2', title: 'Service', status: 'done', done_at: '2026-11-01T10:00:00.000Z', done_by: 'Mechanic' },
  ];
  sdk.tables.WorkshopJobPart = [
    { id: 'jp-open', job_id: 'j-open', part_id: 'p1', part_name: 'Brake pads (front)', part_number: '04465-26420', qty: 1, from_stock: true },
    { id: 'jp-done', job_id: 'j-done', part_name: 'Oil filter (BMW)', part_number: '11428507683', qty: 1, from_stock: false },
  ];
  return sdk;
}
const JOB = { vehicle_kind: 'bus', vehicle_id: 'bus-a', guide_id: 'g1', title: 'Squealing brakes', symptom: 'Squeals when braking', fault_codes: 'C1241', fault_id: 'f1', odometer: 182000 };
const PART = { job_id: 'j-open', part_id: 'p1', qty: 1 };
const job = (sdk, id) => sdk.tables.WorkshopJob.find((j) => j.id === id);

describe('who reaches jobs', () => {
  it.each([null, 'staff', 'passenger', 'driver', 'company'])('%s cannot read or write jobs or their parts', async (role) => {
    for (const [entity, data] of [['WorkshopJob', JOB], ['WorkshopJobPart', PART]]) {
      const sdk = workshop(role);
      const list = await json(await call(sdk, { entity, operation: 'list' }));
      if (role === null) expect(list.status).toBe(401);
      else expect(list.body.result).toEqual([]);
      expect((await call(sdk, { entity, operation: 'create', data })).status).toBe(role === null ? 401 : 403);
      expect(sdk.writes).toEqual([]);
    }
  });

  it('a mechanic starts and edits jobs and takes a part back off an open job, but only an administrator deletes a job', async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'create', data: JOB })).status).toBe(200);
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { notes: 'Pads at 2 mm' } })).status).toBe(200);
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data: PART })).status).toBe(200);
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'delete', id: 'jp-open' })).status).toBe(200);
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'delete', id: 'j-open' })).status).toBe(403);
    const admin = workshop('admin');
    expect((await call(admin, { entity: 'WorkshopJob', operation: 'delete', id: 'j-open' })).status).toBe(200);
  });
});

describe('a job', () => {
  it('copies the vehicle name itself and keeps the job on its vehicle', async () => {
    const sdk = workshop('mechanic');
    const made = await json(await call(sdk, { entity: 'WorkshopJob', operation: 'create', data: { ...JOB, vehicle_name: 'Fake name' } }));
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({ vehicle_name: 'Bus A', status: 'open', title: 'Squealing brakes' });
    const car = await json(await call(sdk, { entity: 'WorkshopJob', operation: 'create', data: { vehicle_kind: 'car', vehicle_id: 'car-1', title: 'Oil change' } }));
    expect(car.body.result.vehicle_name).toBe('BMW X3');
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { vehicle_id: 'bus-b' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { vehicle_kind: 'car' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { vehicle_name: 'Renamed' } })).status).toBe(200);
    expect(job(sdk, 'j-open').vehicle_name).toBe('Bus A');
  });

  it.each([
    ['no title', { ...JOB, title: '  ' }],
    ['a vehicle that is not there', { ...JOB, vehicle_id: 'gone' }],
    ['a car id given as a bus', { ...JOB, vehicle_id: 'car-1', fault_id: '' }],
    ['an unknown kind of vehicle', { ...JOB, vehicle_kind: 'boat' }],
    ['an unknown model page', { ...JOB, guide_id: 'nope' }],
    ["another bus's fault", { ...JOB, fault_id: 'f2' }],
    ['a fault on a car', { vehicle_kind: 'car', vehicle_id: 'car-1', title: 'Service', fault_id: 'f1' }],
    ['a fault id that is not text', { ...JOB, fault_id: { $ne: '' } }],
    ['a title over 120 characters', { ...JOB, title: 'x'.repeat(121) }],
    ['fault codes over 200 characters', { ...JOB, fault_codes: 'P'.repeat(201) }],
    ['an odometer below zero', { ...JOB, odometer: -1 }],
    ['an unknown status', { ...JOB, status: 'waiting' }],
    ['61 steps', { ...JOB, steps: Array.from({ length: 61 }, (_, i) => ({ text: `Step ${i}` })) }],
    ['an empty step', { ...JOB, steps: [{ text: ' ' }] }],
    ['a step over 300 characters', { ...JOB, steps: [{ text: 'x'.repeat(301) }] }],
    ['a step ticked with words', { ...JOB, steps: [{ text: 'Bleed the brakes', done: 'yes' }] }],
    ['a torque id that is not text', { ...JOB, steps: [{ text: 'Bolts', torque_id: { $ne: '' } }] }],
  ])('refuses %s', async (_, data) => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'create', data })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it("keeps steps tidy, with the model's torque values, and drops one from another model or one since deleted", async () => {
    const sdk = workshop('mechanic');
    const steps = [
      { text: ' Lift the bus ', done: true, extra: 'dropped' },
      { text: 'Fit the caliper bracket', torque_id: 't1' },
      { text: 'Wheel bolts', torque_id: 't2' },
      { text: 'Old value', done: true, torque_id: 'gone' },
    ];
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { steps } })).status).toBe(200);
    expect(job(sdk, 'j-open').steps).toEqual([
      { text: 'Lift the bus', done: true },
      { text: 'Fit the caliper bracket', done: false, torque_id: 't1' },
      { text: 'Wheel bolts', done: false },
      { text: 'Old value', done: true },
    ]);
  });

  it('records who marked it done and when, clears that when reopened, and ignores what the screen says about it', async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { status: 'done', fix: 'New pads', done_by: 'Someone else', done_at: '2020-01-01T00:00:00Z' } })).status).toBe(200);
    expect(job(sdk, 'j-open')).toMatchObject({ status: 'done', fix: 'New pads', done_by: 'Caller' });
    expect(Date.parse(job(sdk, 'j-open').done_at)).toBeGreaterThan(Date.parse('2026-01-01'));
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { notes: 'Test drove it' } })).status).toBe(200);
    expect(job(sdk, 'j-open').done_by).toBe('Caller');
    expect((await call(sdk, { entity: 'WorkshopJob', operation: 'update', id: 'j-open', data: { status: 'open' } })).status).toBe(200);
    expect(job(sdk, 'j-open')).toMatchObject({ status: 'open', done_by: '', done_at: null });
  });
});

describe('parts used on a job', () => {
  it("copies a listed part's name and number, whatever the screen sends", async () => {
    const sdk = workshop('mechanic');
    const made = await json(await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data: { ...PART, part_name: 'Cheap copy', part_number: 'X1' } }));
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({ part_id: 'p1', part_name: 'Brake pads (front)', part_number: '04465-26420', qty: 1 });
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'update', id: 'jp-open', data: { part_name: 'Renamed' } })).status).toBe(200);
    expect(sdk.tables.WorkshopJobPart.find((p) => p.id === 'jp-open').part_name).toBe('Brake pads (front)');
  });

  it('writes in a part bought for the job, which never comes from the shelf', async () => {
    const sdk = workshop('mechanic');
    const bought = { job_id: 'j-open', part_name: 'Fan belt (NAPA)', part_number: '25-060445', qty: 1, from_stock: false };
    const made = await json(await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data: bought }));
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({ part_name: 'Fan belt (NAPA)', from_stock: false });
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data: { ...bought, from_stock: true } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data: { job_id: 'j-open', part_name: 'Belt', qty: 1 } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'update', id: made.body.result.id, data: { from_stock: true } })).status).toBe(400);
  });

  it.each([
    ['no amount', { ...PART, qty: undefined }],
    ['nothing used', { ...PART, qty: 0 }],
    ['less than nothing', { ...PART, qty: -1 }],
    ['over 10,000', { ...PART, qty: 10001 }],
    ['an amount in words', { ...PART, qty: 'two' }],
    ['a part that is not on the list', { ...PART, part_id: 'gone' }],
    ['a part id that is not text', { ...PART, part_id: { $ne: '' } }],
    ['a job that is not there', { ...PART, job_id: 'gone' }],
    ['shelf or bought given in words', { ...PART, from_stock: 'yes' }],
    ['a bought part with no name', { job_id: 'j-open', part_name: ' ', qty: 1, from_stock: false }],
  ])('refuses %s', async (_, data) => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it('stays on its job and part: a different part is removed and added', async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'update', id: 'jp-open', data: { part_id: 'p2' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'update', id: 'jp-open', data: { job_id: 'j-done' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'update', id: 'jp-open', data: { qty: 2 } })).status).toBe(200);
    expect(sdk.tables.WorkshopJobPart.find((p) => p.id === 'jp-open').qty).toBe(2);
  });

  it("can't be added, changed or removed once the job is done, for anyone, until it is reopened", async () => {
    for (const role of ['mechanic', 'admin']) {
      const sdk = workshop(role);
      const done = await json(await call(sdk, { entity: 'WorkshopJobPart', operation: 'create', data: { job_id: 'j-done', part_name: 'Belt', qty: 1, from_stock: false } }));
      expect(done).toMatchObject({ status: 409, body: { error: 'This job is done. Reopen it to change its parts' } });
      expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'update', id: 'jp-done', data: { qty: 2 } })).status).toBe(409);
      expect((await call(sdk, { entity: 'WorkshopJobPart', operation: 'delete', id: 'jp-done' })).status).toBe(409);
      expect(sdk.writes).toEqual([]);
    }
  });
});
