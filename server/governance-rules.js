export function quorumSize(electorateCount) {
  const count = Math.max(0, Number(electorateCount) || 0);
  return Math.floor(count / 2) + 1;
}

export function supermajoritySize(electorateCount, ratio = 2 / 3) {
  const count = Math.max(0, Number(electorateCount) || 0);
  return Math.ceil(count * ratio);
}

export function supportThreshold(electorateCount) {
  return Math.max(1, Math.ceil(Math.max(0, Number(electorateCount) || 0) / 3));
}

export function effectiveElectorateSize(electorateCount, recusalCount, requiredRatio = 0.5) {
  const electorate = Math.max(0, Number(electorateCount) || 0);
  if (Number(requiredRatio) >= 2 / 3) return electorate;
  const recusals = Math.max(0, Math.min(electorate, Number(recusalCount) || 0));
  return electorate - recusals;
}

export function proposalOutcome({
  electorateCount,
  yesCount,
  noCount,
  abstainCount,
  requiredRatio = 0.5,
  presidentVote = ""
}) {
  const electorate = Math.max(0, Number(electorateCount) || 0);
  const yes = Math.max(0, Number(yesCount) || 0);
  const no = Math.max(0, Number(noCount) || 0);
  const abstain = Math.max(0, Number(abstainCount) || 0);
  const cast = yes + no + abstain;
  const ratio = Number(requiredRatio) || 0.5;

  if (electorate === 0) return { approved: false, reason: "electorate_empty" };

  if (ratio >= 2 / 3) {
    const threshold = supermajoritySize(electorate, ratio);
    return {
      approved: yes >= threshold,
      reason: yes >= threshold ? "supermajority_reached" : "supermajority_missing",
      threshold,
      cast
    };
  }

  const quorum = quorumSize(electorate);
  if (cast < quorum) return { approved: false, reason: "quorum_missing", quorum, cast };
  if (yes > no) return { approved: true, reason: "majority_yes", quorum, cast };
  if (no > yes) return { approved: false, reason: "majority_no", quorum, cast };
  return {
    approved: presidentVote === "yes",
    reason: presidentVote === "yes" ? "president_tie_break_yes" : "president_tie_break_no",
    quorum,
    cast
  };
}

export function electionOutcome(candidateIds, ballots) {
  const counts = new Map(candidateIds.map((id) => [id, 0]));
  for (const ballot of ballots) {
    if (counts.has(ballot.candidate_id)) {
      counts.set(ballot.candidate_id, counts.get(ballot.candidate_id) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  if (!ranked.length) return { winnerId: null, tiedIds: [], counts: {} };
  const top = ranked[0][1];
  const tiedIds = ranked.filter(([, count]) => count === top).map(([id]) => id);
  return {
    winnerId: tiedIds.length === 1 ? tiedIds[0] : null,
    tiedIds,
    counts: Object.fromEntries(ranked)
  };
}
