// Face data sourced from a dedicated SWRPG dice reference (cross-check against your
// own books if anything looks off — this is the one place a transcription error
// would silently produce wrong results forever).
//
// Symbol keys: S=Success, F=Failure, A=Advantage, T=Threat, TR=Triumph, D=Despair,
// LF=Light Force point, DF=Dark Force point.

const DIE_FACES = {
  boost: [{}, {}, { S: 1 }, { S: 1, A: 1 }, { A: 2 }, { A: 1 }],
  setback: [{}, {}, { F: 1 }, { F: 1 }, { T: 1 }, { T: 1 }],
  ability: [{}, { S: 1 }, { S: 1 }, { S: 2 }, { A: 1 }, { A: 1 }, { S: 1, A: 1 }, { A: 2 }],
  difficulty: [{}, { F: 1 }, { F: 2 }, { T: 1 }, { T: 1 }, { T: 1 }, { T: 2 }, { F: 1, T: 1 }],
  proficiency: [{}, { S: 1 }, { S: 1 }, { S: 2 }, { S: 2 }, { A: 1 }, { S: 1, A: 1 }, { S: 1, A: 1 }, { S: 1, A: 1 }, { A: 2 }, { A: 2 }, { TR: 1 }],
  challenge: [{}, { F: 1 }, { F: 1 }, { F: 2 }, { F: 2 }, { T: 1 }, { T: 1 }, { F: 1, T: 1 }, { F: 1, T: 1 }, { T: 2 }, { T: 2 }, { D: 1 }],
  force: [{ DF: 1 }, { DF: 1 }, { DF: 1 }, { DF: 1 }, { DF: 1 }, { DF: 1 }, { DF: 2 }, { LF: 1 }, { LF: 1 }, { LF: 2 }, { LF: 2 }, { LF: 2 }]
};

const DIE_LABELS = {
  boost: "Boost", setback: "Setback", ability: "Ability", difficulty: "Difficulty",
  proficiency: "Proficiency", challenge: "Challenge", force: "Force"
};

function rollDie(type) {
  const faces = DIE_FACES[type];
  const face = faces[Math.floor(Math.random() * faces.length)];
  return { type, symbols: { ...face } };
}

// pool = { boost: n, setback: n, ability: n, difficulty: n, proficiency: n, challenge: n, force: n }
function rollPool(pool) {
  const diceResults = [];
  Object.entries(pool).forEach(([type, count]) => {
    for (let i = 0; i < (count || 0); i++) {
      diceResults.push(rollDie(type));
    }
  });

  const totals = { S: 0, F: 0, A: 0, T: 0, TR: 0, D: 0, LF: 0, DF: 0 };
  diceResults.forEach((die) => {
    Object.entries(die.symbols).forEach(([sym, count]) => {
      totals[sym] += count;
    });
  });

  // Triumph/Despair contribute to the net success/failure tally (standard convention)
  // but are also reported as their own raw counts for their special-effect triggers.
  const netSuccess = (totals.S + totals.TR) - (totals.F + totals.D);
  const netAdvantage = totals.A - totals.T;

  return {
    diceResults,
    totals,
    net: {
      success: Math.max(netSuccess, 0),
      failure: Math.max(-netSuccess, 0),
      isSuccess: netSuccess >= 0,
      advantage: Math.max(netAdvantage, 0),
      threat: Math.max(-netAdvantage, 0),
      triumph: totals.TR,
      despair: totals.D,
      lightForce: totals.LF,
      darkForce: totals.DF
    }
  };
}

// Short display string for a single die face, e.g. "S,A" or "—" for blank
function symbolsToString(symbols) {
  const parts = [];
  Object.entries(symbols).forEach(([sym, count]) => {
    for (let i = 0; i < count; i++) parts.push(sym);
  });
  return parts.length ? parts.join(" ") : "\u2014";
}
