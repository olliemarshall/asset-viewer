import test from "node:test";
import assert from "node:assert/strict";
import {metrics,flags,validDay,loadProjectRecords} from "../lib/assurance-tracking.js";
const today="2026-11-27";
test("overdue excludes closed and withdrawn, includes outstanding drafts; today is separate",()=>{
 const rows=[{status:"open",due_date:"2026-11-26",owner:"A"},{status:"closed",due_date:"2026-11-26"},{status:"withdrawn",due_date:"2026-11-26"},{status:"draft",due_date:"2026-11-27"},{status:"in_review"}];
 const m=metrics(rows,today);assert.equal(m.total,5);assert.equal(m.outstanding,3);assert.equal(m.overdue,1);assert.equal(m.dueToday,1);assert.equal(m.noDue,1);assert.equal(m.unassigned,2);
});
test("TQ response deadline is distinct from tracker due; missing dates flagged",()=>{
 const r={kind:"tq",status:"open",due_date:"2026-12-01",details:{word_sent:"2026-11-20",word_response_required:"2026-11-26"}};
 assert.equal(flags(r,today).overdue,false);assert.equal(flags(r,today).lateResponse,true);
 r.details.word_reply_date="2026-11-25";assert.equal(flags(r,today).lateResponse,false);
 r.details={response:"Reply recorded"};assert.equal(flags(r,today).missingSent,true);assert.equal(flags(r,today).missingResponseDate,true);
 assert.equal(validDay("2026-02-30"),false);
});
