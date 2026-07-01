import assert from "node:assert/strict";
import {
  effectiveElectorateSize,
  electionOutcome,
  proposalOutcome,
  quorumSize,
  supermajoritySize,
  supportThreshold
} from "../server/governance-rules.js";

assert.equal(quorumSize(5), 3);
assert.equal(quorumSize(4), 3);
assert.equal(supermajoritySize(5), 4);
assert.equal(supportThreshold(7), 3);
assert.equal(effectiveElectorateSize(7, 2), 5);
assert.equal(effectiveElectorateSize(7, 2, 2 / 3), 7);

assert.equal(
  proposalOutcome({ electorateCount: 5, yesCount: 3, noCount: 0, abstainCount: 0 }).approved,
  true
);
assert.equal(
  proposalOutcome({ electorateCount: 5, yesCount: 2, noCount: 0, abstainCount: 0 }).reason,
  "quorum_missing"
);
assert.equal(
  proposalOutcome({
    electorateCount: 5,
    yesCount: 3,
    noCount: 0,
    abstainCount: 0,
    requiredRatio: 2 / 3
  }).approved,
  false
);
assert.equal(
  proposalOutcome({
    electorateCount: 5,
    yesCount: 4,
    noCount: 1,
    abstainCount: 0,
    requiredRatio: 2 / 3
  }).approved,
  true
);
assert.equal(
  proposalOutcome({
    electorateCount: 4,
    yesCount: 2,
    noCount: 2,
    abstainCount: 0,
    presidentVote: "yes"
  }).approved,
  true
);

const election = electionOutcome(
  ["a", "b"],
  [{ candidate_id: "a" }, { candidate_id: "b" }, { candidate_id: "a" }]
);
assert.equal(election.winnerId, "a");
assert.deepEqual(election.counts, { a: 2, b: 1 });

console.log("Governance rules passed.");
